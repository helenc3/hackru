import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { NpcId, SpeechProvider } from '@vibequest/shared';
import { HttpError } from '../../errors.js';

/**
 * Premade multilingual voices used when ELEVENLABS_VOICE_<NPC> is unset. Mandarin comes from the
 * multilingual model, not the voice; override per NPC once the team has reviewed voices.
 */
export const DEFAULT_VOICE_IDS: Record<NpcId, string> = {
  xiaolin: 'EXAVITQu4vr4xnSDxMaL', // Sarah: warm female café owner
  achen: 'IKne3meq5aSn9XLyUdCD', // Charlie: matter-of-fact station worker
  laozhou: 'onwK4e9ZLuTAKqWW03F9', // Daniel: formal ticket agent
};

export const MAX_CLIP_BYTES = 3 * 1024 * 1024;
const MAX_REPLY_CHARS = 80;

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
  if (!(voiceKey in DEFAULT_VOICE_IDS)) throw new HttpError(422, 'UNKNOWN_VOICE', 'Unknown NPC voice.');
  return voiceIds[voiceKey as NpcId] ?? DEFAULT_VOICE_IDS[voiceKey as NpcId];
}

export function createElevenLabsSpeechProvider(options: ElevenLabsSpeechOptions): SpeechProvider {
  const client = new ElevenLabsClient({ apiKey: options.apiKey });
  return {
    async synthesize(text, voiceKey) {
      const line = text.trim();
      if (!line || line.length > MAX_REPLY_CHARS) throw new HttpError(422, 'INVALID_SPEECH_TEXT', 'NPC speech must be 1-80 characters.');
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
