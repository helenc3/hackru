import type { SpeechProvider } from '@vibequest/shared';

export const FIXTURE_SPEECH_LABEL = 'fixture' as const;

/** One silent MPEG-1 Layer III frame (128 kbps, 44.1 kHz, 417 bytes). */
export function silentMp3Frame(): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return frame;
}

/**
 * Test/demo stand-in: returns silence and a configured transcript. It never claims to have
 * recognized anything the player said.
 */
export function createFixtureSpeechProvider(transcript = '请给我一杯茶。'): SpeechProvider & { label: typeof FIXTURE_SPEECH_LABEL } {
  return {
    label: FIXTURE_SPEECH_LABEL,
    synthesize: async () => silentMp3Frame(),
    transcribe: async () => transcript,
  };
}
