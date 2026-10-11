import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { characterDescriptions, audioVoices, npcIdentity, type NpcId, type SpeechProvider } from '@vibequest/shared';
import { HttpError } from '../../errors.js';

/**
 * Human-approved Mandarin assignments; see docs/MANDARIN_VOICES.md.
 * Send authored Hanzi directly; do not convert dialogue to pinyin or IPA.
 */
export const APPROVED_VOICE_IDS = new Set([
  'hZTuv9Zqrq4yHYrEmF1r', 'agczkAUlHLowaNnL72Cc', 'r6qgCCGI7RWKXCagm158',
  'Ca5bKgudqKJzq8YRFoAz', 'MI36FIkp9wRP7cpWKPTl', 'pU9NaAwkoR3v0Mrg3uKz',
  '4VZIsMPtgggwNg7OXbPY', 'DowyQ68vDpgFYdWVGjc3', '5mZxJZhSmJTjL7GoYfYI',
]);

export const DEFAULT_VOICE_IDS = Object.fromEntries(characterDescriptions.map((npc) => [npc.id, npc.voice.id])) as Record<NpcId, string>;
export const DEFAULT_PA_VOICE_ID = audioVoices.pa.id;

export const MAX_CLIP_BYTES = 3 * 1024 * 1024;
// Verified Q2 routes run up to 240 characters (DirectionsSchema.textZh).
const MAX_REPLY_CHARS = 240;

export interface ElevenLabsSpeechOptions {
  apiKey: string;
  ttsModel: string;
  sttModel: string;
  voiceIds: Partial<Record<NpcId, string | undefined>>;
  ttsTimeoutSeconds?: number;
  sttTimeoutSeconds?: number;
}

const speechUnavailable = () => new HttpError(503, 'SPEECH_UNAVAILABLE', 'Mandarin speech is temporarily unavailable.', true);
const transcriptionUnavailable = () => new HttpError(503, 'TRANSCRIPTION_UNAVAILABLE', 'Mandarin transcription is temporarily unavailable.', true);

export function voiceFor(voiceIds: ElevenLabsSpeechOptions['voiceIds'], voiceKey: string): string {
  if (voiceKey.startsWith('npc:')) {
    const identity = npcIdentity(voiceKey.slice(4));
    if (!identity || !APPROVED_VOICE_IDS.has(identity.voiceId)) throw new HttpError(422, 'UNKNOWN_VOICE', 'Unknown NPC voice.');
    return identity.voiceId;
  }
  if (!(voiceKey in DEFAULT_VOICE_IDS)) throw new HttpError(422, 'UNKNOWN_VOICE', 'Unknown NPC voice.');
  const voiceId = voiceIds[voiceKey as NpcId] ?? DEFAULT_VOICE_IDS[voiceKey as NpcId];
  if (!APPROVED_VOICE_IDS.has(voiceId)) throw new HttpError(422, 'UNAPPROVED_VOICE', 'Choose a human-approved Mandarin voice.');
  return voiceId;
}

export function createElevenLabsSpeechProvider(options: ElevenLabsSpeechOptions): SpeechProvider {
  const client = new ElevenLabsClient({ apiKey: options.apiKey });
  return {
    async *streamPcm(text, voiceKey) {
      const line = text.trim();
      if (!line || line.length > MAX_REPLY_CHARS) throw new HttpError(422, 'INVALID_SPEECH_TEXT', 'NPC speech must be 1-240 characters.');
      const voiceId = voiceFor(options.voiceIds, voiceKey);
      let stream: ReadableStream<Uint8Array>;
      try {
        stream = await client.textToSpeech.stream(voiceId,
          { text: line, modelId: options.ttsModel, outputFormat: 'pcm_24000', languageCode: 'zh' },
          { timeoutInSeconds: options.ttsTimeoutSeconds ?? 5, maxRetries: 0 });
      } catch { throw speechUnavailable(); }
      // PCM16 samples are 2 bytes; network chunks may split one, so carry an odd byte to the next chunk.
      let carry: Uint8Array = new Uint8Array(0);
      try {
        for await (const chunk of stream) {
          const joined = new Uint8Array(carry.length + chunk.length); joined.set(carry); joined.set(chunk, carry.length);
          const even = joined.length - (joined.length % 2);
          carry = joined.slice(even);
          if (even) yield joined.subarray(0, even);
        }
      } catch { throw speechUnavailable(); }
    },
    async synthesizePcm(text, voiceKey) {
      const line = text.trim();
      if (!line || line.length > MAX_REPLY_CHARS) throw new HttpError(422, 'INVALID_SPEECH_TEXT', 'NPC speech must be 1-240 characters.');
      const voiceId = voiceFor(options.voiceIds, voiceKey);
      try {
        const stream = await client.textToSpeech.convert(voiceId,
          { text: line, modelId: options.ttsModel, outputFormat: 'pcm_24000', languageCode: 'zh' },
          { timeoutInSeconds: options.ttsTimeoutSeconds ?? 5, maxRetries: 0 });
        const audio = new Uint8Array(await new Response(stream).arrayBuffer());
        if (!audio.length) throw new Error('empty audio');
        return audio;
      } catch { throw speechUnavailable(); }
    },
    async synthesize(text, voiceKey) {
      const line = text.trim();
      if (!line || line.length > MAX_REPLY_CHARS) throw new HttpError(422, 'INVALID_SPEECH_TEXT', 'NPC speech must be 1-240 characters.');
      const voiceId = voiceFor(options.voiceIds, voiceKey);
      try {
        const stream = await client.textToSpeech.convert(
          voiceId,
          { text: line, modelId: options.ttsModel, outputFormat: 'mp3_44100_128', languageCode: 'zh' },
          { timeoutInSeconds: options.ttsTimeoutSeconds ?? 5, maxRetries: 0 },
        );
        const audio = new Uint8Array(await new Response(stream).arrayBuffer());
        if (!audio.length) throw new Error('empty audio');
        return audio;
      } catch {
        throw speechUnavailable(); // Fixed message: never echo keys or provider bodies.
      }
    },
    async transcribe(audio, mimeType) {
      if (!audio.length || audio.length > MAX_CLIP_BYTES) throw new HttpError(413, 'CLIP_TOO_LARGE', 'Clips must be between 1 byte and 3 MB.');
      try {
        const result = await client.speechToText.convert(
          { file: { data: audio, filename: 'clip', contentType: mimeType }, modelId: options.sttModel, languageCode: 'zh', diarize: false, tagAudioEvents: false },
          { timeoutInSeconds: options.sttTimeoutSeconds ?? 8, maxRetries: 0 },
        );
        return (result.text ?? '').trim();
      } catch {
        throw transcriptionUnavailable();
      }
    },
  };
}

/** No key configured: recoverable outage, never a fabricated transcript or clip. */
export function createUnavailableSpeechProvider(): SpeechProvider {
  return {
    synthesize: () => Promise.reject(speechUnavailable()),
    transcribe: () => Promise.reject(transcriptionUnavailable()),
  };
}

/** ponytail: assumes CBR mp3_44100_128 (what synthesize requests); parse frames if formats change. */
export function mp3DurationMs(audio: Uint8Array): number {
  return Math.min(80_000, Math.max(1, Math.round((audio.length * 8) / 128)));
}
