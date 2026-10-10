import type { DialogueProvider, SpeechProvider } from '@vibequest/shared';
import type { ServerConfig } from './config.js';
import { createDialogueProvider } from './providers/dialogue.js';
import { createSpeechProvider } from './providers/speech.js';
import { createSessionStore, type SessionStore } from './session-store.js';

/** Frozen injection seam: routers never instantiate or import a private provider. */
export interface ServerServices {
  config: ServerConfig;
  sessionStore: SessionStore;
  dialogueProvider: DialogueProvider;
  speechProvider: SpeechProvider;
}

export function createServices(config: ServerConfig): ServerServices {
  return {
    config,
    sessionStore: createSessionStore(),
    dialogueProvider: createDialogueProvider(config),
    speechProvider: createSpeechProvider(config),
  };
}
