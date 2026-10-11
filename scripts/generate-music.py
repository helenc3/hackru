"""Rebuild the original ambient MIDI and its browser playback score (no dependencies)."""
from pathlib import Path
import json
import random
import struct

ROOT = Path(__file__).resolve().parents[1]
RNG = random.Random(2718)
PPQ = 480
BPM = 72
BEATS = 256  # 64 bars, 3:33; the last suspended harmony resolves into the first.
notes = []


def note(channel, pitch, beat, duration, velocity):
    notes.append(dict(channel=channel, pitch=pitch, beat=beat,
                      duration=min(duration, BEATS-beat), velocity=velocity))


chords = [(48, 55, 62, 64, 71), (45, 55, 60, 64, 67),
          (41, 53, 60, 64, 67), (43, 55, 60, 62, 69)]
for section in range(16):
    base = section * 16
    chord = chords[section % 4]
    for i, pitch in enumerate(chord):
        note(0, pitch, base + i * .04, 15.8 - i * .04, 34 + RNG.randrange(6))
    for bar in range(4):
        t = base + bar * 4
        upper = [p + 12 if p < 60 else p for p in chord[1:]]
        for j, beat in enumerate([.12, 1.65, 3.05]):
            note(1, upper[(bar+j+section) % len(upper)], t+beat, 1.25, 37+RNG.randrange(12))
        if bar in (0, 2):
            note(1, chord[0], t, 3.2, 34)
        # Delicate guzheng-like pentatonic responses, with occasional rolled dyads.
        if bar in (1, 3):
            phrase = [72, 74, 79, 76] if section % 2 == 0 else [79, 76, 74, 72]
            for j, pitch in enumerate(phrase):
                note(2, pitch, t+.35+j*.8, .72, 30+RNG.randrange(9))
            if section % 3 == 0:
                for j, pitch in enumerate([60, 67, 72]):
                    note(2, pitch, t+.08*j, 1.4, 27+j*2)
    if section % 4 in (1, 3):
        phrase = [79, 76, 74, 72] if section % 4 == 1 else [74, 76, 79, 74]
        for pitch, offset in zip(phrase, [2, 5.5, 9, 12]):
            note(3, pitch, base+offset, 2.6, 30+RNG.randrange(5))
    if section >= 4 and section % 2 == 0:
        for pitch, offset in zip([84, 79, 86], [3, 8, 13]):
            note(4, pitch, base+offset, 2.3, 23+RNG.randrange(5))


def vlq(value):
    result = [value & 127]
    value >>= 7
    while value:
        result.insert(0, (value & 127) | 128)
        value >>= 7
    return bytes(result)


def meta(kind, value):
    return bytes([255, kind]) + vlq(len(value)) + value


def track(events):
    data = bytearray()
    previous = 0
    for tick, priority, message in sorted(events, key=lambda e: (e[0], e[1])):
        data += vlq(tick-previous) + message
        previous = tick
    data += vlq(BEATS*PPQ-previous) + b'\xff\x2f\x00'
    return b'MTrk' + struct.pack('>I', len(data)) + data


tracks = [track([(0, 0, meta(3, b'Quiet District')),
                 (0, 0, meta(81, round(60000000/BPM).to_bytes(3, 'big'))),
                 (0, 0, meta(88, bytes([4, 2, 24, 8]))),
                 (0, 0, meta(6, b'LOOP_START')),
                 (BEATS*PPQ, 0, meta(6, b'LOOP_END'))])]
for channel, (name, program) in enumerate([
        ('Warm pads', 89), ('Cafe piano', 0), ('Zither accents', 107),
        ('Airy flute', 73), ('Distant bells', 10)]):
    events = [(0, 0, meta(3, name.encode())), (0, 0, bytes([192+channel, program])),
              (0, 0, bytes([176+channel, 91, 65]))]
    channel_notes = sorted([n for n in notes if n['channel'] == channel], key=lambda n: n['beat'])
    for i, n in enumerate(channel_notes):
        # Avoid repeated-pitch overlap in players that release all matching voices.
        following = next((m['beat'] for m in channel_notes[i+1:] if m['pitch'] == n['pitch']), BEATS)
        n['duration'] = min(n['duration'], following-n['beat'])
        events.extend([(round(n['beat']*PPQ), 2, bytes([144+channel, n['pitch'], n['velocity']])),
                       (round((n['beat']+n['duration'])*PPQ), 1, bytes([128+channel, n['pitch'], 0]))])
    tracks.append(track(events))
(ROOT/'apps/web/public/music/song.midi').write_bytes(b'MThd'+struct.pack('>IHHH', 6, 1, len(tracks), PPQ)+b''.join(tracks))
notes.sort(key=lambda n: n['beat'])
score = dict(bpm=BPM, beats=BEATS, notes=notes)
(ROOT/'apps/web/public/music/song.json').write_text(json.dumps(score, separators=(',', ':'))+'\n')
assert all(0 <= n['beat'] < BEATS and n['duration'] > 0 for n in notes)
print(f'Generated song.midi and browser score: {len(notes)} notes, {BEATS*60/BPM:.1f}s loop.')
