import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { TurnContextSchema, validateEvaluationForContext, type DialogueProvider, type TurnEvaluation } from '@vibequest/shared';
import { HttpError } from '../../errors.js';
import { clarificationEvaluation } from './gate.js';
import { buildPrompt, responseSchemaFor } from './prompt.js';

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

const MAX_INPUT_CHARS = 500;

/**
 * Thinking is on by default for current Flash models and eats the 8 s budget. 2.5 Flash
 * accepts budget 0 (off); Gemini 3 models take a level instead. Unknown families keep defaults.
 */
export function thinkingConfigFor(model: string): ThinkingConfig | undefined {
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  return undefined;
}

function providerError(code: 'PROVIDER_TIMEOUT' | 'PROVIDER_QUOTA' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_INVALID_OUTPUT', message: string) {
  // Messages are fixed strings: never echo keys or raw provider output.
  return new HttpError(503, code, message, true);
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Network failures and 5xx are worth one retry; quota and other 4xx are not. */
function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  return status === undefined ? error instanceof TypeError || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(String((error as Error)?.message ?? error)) : status >= 500;
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    promise.then(resolve, reject);
  });
}

export function createGeminiDialogueProvider(options: GeminiDialogueOptions): DialogueProvider {
  const budgetMs = options.budgetMs ?? 8_000;
  let client = options.client;
  const getClient = (): GeminiClient => {
    if (!client) {
      const models = new GoogleGenAI({ apiKey: options.apiKey }).models;
      client = { generateContent: (request) => models.generateContent(request) };
    }
    return client;
  };

  return {
    async evaluate(rawContext, rawText): Promise<TurnEvaluation> {
      const context = TurnContextSchema.parse(rawContext);
      const playerText = rawText.trim();
      if (playerText.length > MAX_INPUT_CHARS) throw new HttpError(400, 'INPUT_TOO_LONG', `Player input exceeds ${MAX_INPUT_CHARS} characters.`);
      if (!playerText) return clarificationEvaluation(context, playerText);

      const { systemInstruction, contents } = buildPrompt(context, playerText);
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error('budget exceeded')), budgetMs);
      let text: string | undefined;
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const response = await untilAborted(getClient().generateContent({
              model: options.model, contents,
              config: {
                systemInstruction, responseMimeType: 'application/json', responseJsonSchema: responseSchemaFor(context),
                maxOutputTokens: 2_048, temperature: 0.2, abortSignal: deadline.signal,
                thinkingConfig: thinkingConfigFor(options.model),
              },
            }), deadline.signal);
            text = response.text;
            break;
          } catch (error) {
            if (deadline.signal.aborted) throw providerError('PROVIDER_TIMEOUT', `Gemini did not answer within ${budgetMs} ms.`);
            if (statusOf(error) === 429) throw providerError('PROVIDER_QUOTA', 'Gemini quota or rate limit reached.');
            if (attempt === 0 && isTransient(error)) continue;
            throw providerError('PROVIDER_UNAVAILABLE', `Gemini request failed${statusOf(error) ? ` (HTTP ${statusOf(error)})` : ''}.`);
          }
        }
      } finally {
        clearTimeout(timer);
      }

      try {
        return validateEvaluationForContext(JSON.parse(text ?? ''), context, playerText);
      } catch {
        throw providerError('PROVIDER_INVALID_OUTPUT', 'Gemini returned an evaluation that failed validation.');
      }
    },
  };
}
