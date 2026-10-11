import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_IDS, voiceFor } from '../../src/providers/elevenlabs/live.js';

describe('reviewed Mandarin voice selection', () => {
  it('assigns distinct approved voices to the three NPC roles', () => {
    expect(voiceFor({}, 'vendor')).toBe('Ca5bKgudqKJzq8YRFoAz');
    expect(voiceFor({}, 'guide')).toBe('4VZIsMPtgggwNg7OXbPY');
    expect(voiceFor({}, 'passerby')).toBe('5mZxJZhSmJTjL7GoYfYI');
    expect(new Set(Object.values(DEFAULT_VOICE_IDS)).size).toBe(3);
  });

  it('allows another approved voice as an override', () => {
    expect(voiceFor({ vendor: 'r6qgCCGI7RWKXCagm158' }, 'vendor')).toBe('r6qgCCGI7RWKXCagm158');
  });

  it.each(['9lHjugDhwqoxA5MhX0az', 'EXAVITQu4vr4xnSDxMaL', 'untested-voice'])('rejects unapproved override %s', (voiceId) => {
    expect(() => voiceFor({ vendor: voiceId }, 'vendor')).toThrow(expect.objectContaining({ code: 'UNAPPROVED_VOICE' }));
  });

  it('rejects unknown character keys, including retired station NPCs', () => {
    for (const key of ['unknown', 'xiaolin', 'laozhou']) expect(() => voiceFor({}, key)).toThrow(expect.objectContaining({ code: 'UNKNOWN_VOICE' }));
  });
});
