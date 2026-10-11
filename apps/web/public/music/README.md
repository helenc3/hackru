Quiet District is an original 64-bar ambient composition at 72 BPM (3:33 per loop).
Warm sustained chords, sparse piano, pentatonic zither accents, flute and bells
support the streamed city without a heavy rhythmic pulse.

`song.midi` is a General MIDI format-1 file. Its zither part uses the GM Koto
patch; the exact timbre depends on the player's sound bank. `song.json` contains
the same notes for the game's lightweight Web Audio synthesizer, with plucked
string harmonics approximating the zither. Neither asset needs an external service.
Regenerate both from the repository root with `python3 scripts/generate-music.py`.

Runtime playback repeats indefinitely on the audio clock, preserving echo tails
across the boundary. The eight-second entrance is applied once per session,
rather than embedded in every loop. Conversation and NPC speech playback lower the
music; microphone recording silences it. Volume returns over 2.5 seconds.
Muted or paused gameplay is silent, hidden tabs suspend playback, and leaving
the session releases the audio context. Browser autoplay restrictions may
require a key press, click, or the Enable music button.
