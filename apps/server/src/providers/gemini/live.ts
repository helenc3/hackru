import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { DialogueProvider } from '@vibequest/shared';
import { createJsonDialogueProvider } from '../json-dialogue.js';

export interface GenerateRequest {
  model: string;
  contents: string;
  config: {
    systemInstruction: string;
    responseMimeType: 'application/json';
    responseJsonSchema: unknown;
    maxOutputTokens: number;
    temperature: number;
    abortSignal: AbortSignal;
    thinkingConfig?: ThinkingConfig;
  };
}
export interface GeminiClient { generateContent(request: GenerateRequest): Promise<{ text?: string }> }

export interface GeminiDialogueOptions {
  apiKey: string;
  model: string;
  budgetMs?: number;
  client?: GeminiClient;
}

/**
 * Thinking is on by default for current Flash models and eats the 8 s budget. 2.5 Flash
 * accepts budget 0 (off); Gemini 3 models take a level instead. Unknown families keep defaults.
 */
export function thinkingConfigFor(model: string): ThinkingConfig | undefined {
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  return undefined;
}

export function createGeminiDialogueProvider(options: GeminiDialogueOptions): DialogueProvider {
  let client = options.client;
  const getClient = (): GeminiClient => {
    if (!client) {
      const models = new GoogleGenAI({ apiKey: options.apiKey }).models;
      client = { generateContent: (request) => models.generateContent(request) };
    }
    return client;
  };

  return createJsonDialogueProvider({
    name: 'Gemini', budgetMs: options.budgetMs,
    generate: async ({ systemInstruction, contents, schema }, _context, abortSignal) => (await getClient().generateContent({
      model: options.model, contents,
      config: {
        systemInstruction, responseMimeType: 'application/json', responseJsonSchema: schema,
        maxOutputTokens: 2_048, temperature: 0.2, abortSignal, thinkingConfig: thinkingConfigFor(options.model),
      },
    })).text,
  });
}
