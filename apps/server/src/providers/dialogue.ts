import type { DialogueProvider } from '@vibequest/shared';
import type { ServerConfig } from '../config.js';
import { HttpError } from '../errors.js';
import { createGeminiDialogueProvider } from './gemini/live.js';

export { createFixtureDialogueProvider } from './gemini/fixture.js';
export { createGeminiDialogueProvider } from './gemini/live.js';
export { meetsProgressionGate } from './gemini/gate.js';

/**
 * Live Gemini when a server key is configured. Without one, fail as a recoverable
 * outage rather than silently substituting fixtures: fixture sessions opt in explicitly
 * through createFixtureDialogueProvider so they are never represented as live AI.
 */
export function createDialogueProvider(config: ServerConfig): DialogueProvider {
  if (config.geminiApiKey) {
    return createGeminiDialogueProvider({ apiKey: config.geminiApiKey, model: config.geminiModel });
  }
  return {
    evaluate: () =>
      Promise.reject(new HttpError(503, 'PROVIDER_UNAVAILABLE', 'Gemini is not configured on this server.', true)),
  };
}
