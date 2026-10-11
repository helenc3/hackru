import { TurnContextSchema, validateEvaluationForContext, type DialogueProvider, type TurnContext, type TurnEvaluation } from '@vibequest/shared';
import { HttpError } from '../errors.js';
import { clarificationEvaluation } from './gemini/gate.js';
import { buildPrompt, responseSchemaFor } from './gemini/prompt.js';

export const MAX_INPUT_CHARS = 500;

export interface DialoguePrompt { systemInstruction: string; contents: string; schema: Record<string, unknown> }

export interface JsonDialogueOptions {
  /** Provider name for the fixed error messages, e.g. "Gemini". */
  name: string;
  budgetMs?: number;
  /** One model call. Returns the JSON text, or undefined when the model produced none. */
  generate(prompt: DialoguePrompt, context: TurnContext, signal: AbortSignal): Promise<string | undefined>;
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
  return status === undefined
    ? error instanceof TypeError || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|Connection error/i.test(String((error as Error)?.message ?? error))
    : status >= 500;
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    promise.then(resolve, reject);
  });
}

/**
 * Shared evaluate loop for any JSON-structured-output dialogue model: input guards, prompt,
 * one deadline, one transient retry, fixed error codes, and client-side schema validation.
 */
export function createJsonDialogueProvider(options: JsonDialogueOptions): DialogueProvider {
  const budgetMs = options.budgetMs ?? 8_000;
  return {
    async evaluate(rawContext, rawText): Promise<TurnEvaluation> {
      const context = TurnContextSchema.parse(rawContext);
      const playerText = rawText.trim();
      if (playerText.length > MAX_INPUT_CHARS) throw new HttpError(400, 'INPUT_TOO_LONG', `Player input exceeds ${MAX_INPUT_CHARS} characters.`);
      if (!playerText) return clarificationEvaluation(context, playerText);

      const prompt: DialoguePrompt = { ...buildPrompt(context, playerText), schema: responseSchemaFor(context) };
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error('budget exceeded')), budgetMs);
      let text: string | undefined;
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            text = await untilAborted(options.generate(prompt, context, deadline.signal), deadline.signal);
            break;
          } catch (error) {
            if (deadline.signal.aborted) throw providerError('PROVIDER_TIMEOUT', `${options.name} did not answer within ${budgetMs} ms.`);
            if (statusOf(error) === 429) throw providerError('PROVIDER_QUOTA', `${options.name} quota or rate limit reached.`);
            if (attempt === 0 && isTransient(error)) continue;
            throw providerError('PROVIDER_UNAVAILABLE', `${options.name} request failed${statusOf(error) ? ` (HTTP ${statusOf(error)})` : ''}.`);
          }
        }
      } finally {
        clearTimeout(timer);
      }

      try {
        return validateEvaluationForContext(JSON.parse(text ?? ''), context, playerText);
      } catch {
        throw providerError('PROVIDER_INVALID_OUTPUT', `${options.name} returned an evaluation that failed validation.`);
      }
    },
  };
}
