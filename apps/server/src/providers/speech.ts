import type { SpeechProvider } from '@vibequest/shared';
import type { ServerConfig } from '../config.js';
import { createElevenLabsSpeechProvider, createUnavailableSpeechProvider } from './elevenlabs/live.js';


/** Live ElevenLabs when a server key exists; otherwise a recoverable 503, never fabricated audio. */
export function createSpeechProvider(config: ServerConfig): SpeechProvider {
  if (!config.elevenlabsApiKey) return createUnavailableSpeechProvider();
  return createElevenLabsSpeechProvider({
    apiKey: config.elevenlabsApiKey,
    ttsModel: config.elevenlabsTtsModel,
    sttModel: config.elevenlabsSttModel,
    voiceIds: config.voiceIds,
  });
}
