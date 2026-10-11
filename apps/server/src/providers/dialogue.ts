import type { DialogueProvider } from '@vibequest/shared';
import type { ServerConfig } from '../config.js';
import { HttpError } from '../errors.js';
import { createClaudeDialogueProvider } from './claude/live.js';
import { createGeminiDialogueProvider } from './gemini/live.js';


/**
 * Live Claude when an Anthropic key is configured, else live Gemini when its key is. Without one, fail as a recoverable
 * outage rather than silently substituting fixtures: fixture sessions opt in explicitly
 * through createFixtureDialogueProvider so they are never represented as live AI.
 */
export function createDialogueProvider(config: ServerConfig): DialogueProvider {
  if (config.anthropicApiKey) {
    return createClaudeDialogueProvider({ apiKey: config.anthropicApiKey, model: config.anthropicModel });
  }
  if (config.geminiApiKey) {
    return createGeminiDialogueProvider({ apiKey: config.geminiApiKey, model: config.geminiModel });
  }
  return {
    evaluate: () =>
      Promise.reject(new HttpError(503, 'PROVIDER_UNAVAILABLE', 'No dialogue model is configured on this server.', true)),
  };
}
