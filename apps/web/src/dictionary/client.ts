import { AnnotateResponseSchema, ApiErrorSchema, LookupResponseSchema, type AnnotateResponse, type LookupResponse } from '@vibequest/shared';

/** Server error with its user-facing message (e.g. 422 PHRASE_NOT_ALLOWED for multi-word lookups). */
export class DictionaryError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'DictionaryError'; }
}

async function call<T>(path: string, schema: { parse: (value: unknown) => T }, body?: unknown): Promise<T> {
  const response = await fetch(`/api/dictionary${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(json);
    throw new DictionaryError(response.status, error.success ? error.data.error.code : 'HTTP_ERROR', error.success ? error.data.error.message : 'The dictionary is unavailable.');
  }
  return schema.parse(json);
}

/** One word only: Hanzi, pinyin (shui3 / shuǐ / shui) or a single English word. */
export const lookupWord = (q: string): Promise<LookupResponse> => call(`/lookup?q=${encodeURIComponent(q.trim())}`, LookupResponseSchema);
/** Segment a line into glossed tokens plus whole-line pinyin and translation. */
export const annotateText = (text: string): Promise<AnnotateResponse> => call('/annotate', AnnotateResponseSchema, { text });
