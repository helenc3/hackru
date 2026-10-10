import type { SpeechProvider } from '@vibequest/shared';
import type { ServerConfig } from '../config.js';
import { SegmentNotImplementedError } from '../errors.js';

/** Segment-005 replaces this adapter; bootstrap never contacts ElevenLabs. */
export function createSpeechProvider(config: ServerConfig): SpeechProvider {
  void config;
  return {
    synthesize: () =>
      Promise.reject(new SegmentNotImplementedError('Segment-005', 'Mandarin speech synthesis')),
    transcribe: () =>
      Promise.reject(new SegmentNotImplementedError('Segment-005', 'Mandarin transcription')),
  };
}
