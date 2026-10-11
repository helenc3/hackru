import Anthropic from '@anthropic-ai/sdk';
import type { DialogueProvider } from '@vibequest/shared';
import { createJsonDialogueProvider } from '../json-dialogue.js';

export interface ClaudeClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming, options: { signal: AbortSignal }): Promise<Anthropic.Message>;
}

export interface ClaudeDialogueOptions {
  apiKey: string;
  model: string;
  budgetMs?: number;
  client?: ClaudeClient;
}

const UNSUPPORTED_KEYWORDS = new Set(['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']);

/**
 * Structured outputs reject range/length keywords and require additionalProperties:false on
 * every object. The dropped constraints are still enforced client-side by validateEvaluationForContext.
 */
export function strictSchema(schema: unknown): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = Object.fromEntries(Object.entries(node)
      .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
      .map(([key, value]) => [key, key === 'properties' ? Object.fromEntries(Object.entries(value as object).map(([name, sub]) => [name, walk(sub)])) : walk(value)]));
    return out.type === 'object' ? { ...out, additionalProperties: false } : out;
  };
  return walk(schema) as Record<string, unknown>;
}

export function createClaudeDialogueProvider(options: ClaudeDialogueOptions): DialogueProvider {
  let client = options.client;
  const getClient = (): ClaudeClient => {
    // maxRetries 0: the shared loop retries one transient failure itself, and 429 must fail fast within the turn budget.
    if (!client) client = new Anthropic({ apiKey: options.apiKey, maxRetries: 0 }).messages;
    return client;
  };

  return createJsonDialogueProvider({
    name: 'Claude', budgetMs: options.budgetMs,
    generate: async ({ systemInstruction, contents, schema }, _context, signal) => {
      const response = await getClient().create({
        model: options.model, max_tokens: 2_048, system: systemInstruction,
        messages: [{ role: 'user', content: contents }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: strictSchema(schema) } },
      }, { signal });
      if (response.stop_reason === 'refusal') return undefined;
      return response.content.find((block) => block.type === 'text')?.text;
    },
  });
}
