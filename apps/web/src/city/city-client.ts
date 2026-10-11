import {
  ApiErrorSchema, GENERATION_RULES, ChunkResponseSchema, ChunkRestoreResponseSchema, WorldInfoSchema,
  type ChunkCoord, type ChunkManifest, type ChunkResponse, type ChunkRestoreResponse, type WorldInfo,
} from '@vibequest/shared';

/** Transport for the city routes (proposals/city-streaming-contracts.md → Server). Responses are schema-checked. */
export type CityClient = {
  world(worldId: string): Promise<WorldInfo>;
  chunks(sessionId: string, coords: ChunkCoord[], urgent: boolean): Promise<ChunkResponse>;
  restore(sessionId: string, chunks: ChunkManifest[]): Promise<ChunkRestoreResponse>;
};

export class CityClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'CityClientError'; }
}

export function createCityClient(options: { baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number } = {}): CityClient {
  const baseUrl = options.baseUrl ?? '/api';
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  async function call<T>(path: string, schema: { parse: (value: unknown) => T }, body?: unknown): Promise<T> {
    // Allow the server's generation deadline plus one round trip.
    const signal = AbortSignal.timeout(options.timeoutMs ?? GENERATION_RULES.deadlineMs + 4_000);
    const response = await transport(`${baseUrl}${path}`, body === undefined ? { signal } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    const json: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = ApiErrorSchema.safeParse(json);
      throw new CityClientError(response.status, error.success ? error.data.error.code : 'HTTP_ERROR', error.success ? error.data.error.message : 'The city request failed.');
    }
    return schema.parse(json);
  }
  const session = (id: string) => `/sessions/${encodeURIComponent(id)}`;
  return {
    world: (worldId) => call(`/worlds/${encodeURIComponent(worldId)}`, WorldInfoSchema),
    chunks: (sessionId, coords, urgent) => call(`${session(sessionId)}/chunks`, ChunkResponseSchema, { coords, urgent }),
    restore: (sessionId, chunks) => call(`${session(sessionId)}/chunks/restore`, ChunkRestoreResponseSchema, { chunks }),
  };
}
