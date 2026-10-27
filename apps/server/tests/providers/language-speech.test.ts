import { beforeEach, describe, expect, it, vi } from 'vitest';
const { convert, stream, transcribe } = vi.hoisted(() => ({ convert: vi.fn(), stream: vi.fn(), transcribe: vi.fn() }));
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class { textToSpeech = { convert, stream }; speechToText = { convert: transcribe }; },
}));
import { createElevenLabsSpeechProvider } from '../../src/providers/elevenlabs/live.js';

const provider = () => createElevenLabsSpeechProvider({ apiKey: 'fixture-key', ttsModel: 'fixture', sttModel: 'fixture', voiceIds: {} });
beforeEach(() => {
  vi.clearAllMocks();
  convert.mockResolvedValue(new Uint8Array([0, 0, 1, 0]));
  stream.mockImplementation(async () => new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0, 0, 1, 0])); controller.close(); } }));
  transcribe.mockResolvedValue({ text: 'I would like tea.' });
});
describe('speech language selection', () => {
  it('passes English to batch TTS, PCM TTS, streamed TTS and transcription', async () => {
    const speech = provider();
    await speech.synthesize('Tea is ten yuan.', 'vendor', 'en');
    await speech.synthesizePcm!('Tea is ten yuan.', 'vendor', 'en');
    for await (const chunk of speech.streamPcm!('Tea is ten yuan.', 'vendor', 'en')) expect(chunk.length).toBe(4);
    expect(await speech.transcribe(new Uint8Array([1]), 'audio/webm', 'en')).toBe('I would like tea.');
    for (const call of convert.mock.calls) expect(call[1].languageCode).toBe('en');
    expect(stream.mock.calls[0]![1].languageCode).toBe('en');
    expect(transcribe.mock.calls[0]![0].languageCode).toBe('en');
  });
  it('keeps Mandarin as the default and its original text bound', async () => {
    const speech = provider();
    await speech.synthesize('一杯茶十元。', 'vendor');
    expect(convert.mock.calls[0]![1].languageCode).toBe('zh');
    await expect(speech.synthesize('你'.repeat(241), 'vendor')).rejects.toMatchObject({ code: 'INVALID_SPEECH_TEXT' });
    await speech.synthesize('Walk east along Nanjing Road. '.repeat(12), 'guide', 'en');
    expect(convert.mock.calls[1]![1].text).toHaveLength('Walk east along Nanjing Road. '.repeat(12).trim().length);
  });
});
