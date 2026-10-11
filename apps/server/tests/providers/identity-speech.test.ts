import { describe, expect, it, vi } from 'vitest';
const { convert } = vi.hoisted(() => ({ convert: vi.fn() }));
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class { textToSpeech = { convert }; },
}));
import { createElevenLabsSpeechProvider } from '../../src/providers/elevenlabs/live.js';

describe('identity speech output', () => {
  it('sends Hanzi to the approved male voice as PCM for the live relay', async () => {
    convert.mockResolvedValue(new Uint8Array([0, 0, 1, 0]));
    const provider = createElevenLabsSpeechProvider({ apiKey: 'fixture-key', ttsModel: 'eleven_v4_turbo', sttModel: 'fixture', voiceIds: {} });
    expect(await provider.synthesizePcm!('您好，喝什么？', 'npc:laowang')).toEqual(new Uint8Array([0, 0, 1, 0]));
    expect(convert).toHaveBeenCalledWith('hZTuv9Zqrq4yHYrEmF1r',
      expect.objectContaining({ text: '您好，喝什么？', outputFormat: 'pcm_24000', languageCode: 'zh' }), expect.any(Object));
  });
});
