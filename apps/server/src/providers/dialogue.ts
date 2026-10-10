import type { DialogueProvider } from '@vibequest/shared';
import type { ServerConfig } from '../config.js';
import { SegmentNotImplementedError } from '../errors.js';

/** Segment-002 replaces this adapter; bootstrap never contacts Gemini. */
export function createDialogueProvider(config: ServerConfig): DialogueProvider {
  void config;
  return {
    evaluate: () =>
      Promise.reject(new SegmentNotImplementedError('Segment-002', 'NPC dialogue evaluation')),
  };
}
