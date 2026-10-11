import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_IDS, voiceFor } from '../../src/providers/elevenlabs/live.js';

describe('reviewed Mandarin voice selection', () => {
  it('assigns distinct approved voices to the three NPCs', () => {
    expect(voiceFor({}, 'xiaolin')).toBe(DEFAULT_VOICE_IDS.xiaolin);
    expect(voiceFor({}, 'achen')).toBe(DEFAULT_VOICE_IDS.achen);
    expect(voiceFor({}, 'laozhou')).toBe(DEFAULT_VOICE_IDS.laozhou);
    expect(new Set(Object.values(DEFAULT_VOICE_IDS)).size).toBe(3);
  });

  it('allows another approved voice as an override', () => {
    expect(voiceFor({ xiaolin: 'r6qgCCGI7RWKXCagm158' }, 'xiaolin')).toBe('r6qgCCGI7RWKXCagm158');
  });

  it.each(['9lHjugDhwqoxA5MhX0az', 'EXAVITQu4vr4xnSDxMaL', 'untested-voice'])('rejects unapproved override %s', (voiceId) => {
    expect(() => voiceFor({ xiaolin: voiceId }, 'xiaolin')).toThrow(expect.objectContaining({ code: 'UNAPPROVED_VOICE' }));
  });

  it('rejects unknown character keys', () => {
    expect(() => voiceFor({}, 'unknown')).toThrow(expect.objectContaining({ code: 'UNKNOWN_VOICE' }));
  });
});
