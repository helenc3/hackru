import {
  ActionRequestSchema,
  ActionResponseSchema,
  ApiErrorSchema,
  CreateSessionRequestSchema,
  StateResponseSchema,
  TurnRequestSchema,
  TurnResponseSchema,
  type ActionRequest,
  type ActionResponse,
  type CreateSessionRequest,
  type GameEvent,
  type PublicState,
  type TurnRequest,
  type TurnResponse,
} from '@vibequest/shared';

/** A transport seam, not a fixture engine. The server implements these routes. */
export type CreateSessionInput = Pick<CreateSessionRequest, 'initialTier' | 'providerMode'>
  & Partial<Pick<CreateSessionRequest, 'validationMode' | 'inputPreference' | 'worldId'>>;
export type ActionResult = ActionResponse;
export type EventListener = (event: GameEvent) => void;

export class SessionClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly state?: PublicState;

  constructor(status: number, code: string, message: string, retryable: boolean, state?: PublicState) {
    super(message);
    this.name = 'SessionClientError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.state = state;
  }
}

type ResponseSchema<T> = { parse: (input: unknown) => T };

export function createSessionClient(options: { baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number } = {}) {
  const baseUrl = options.baseUrl ?? '/api';
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  const listeners = new Map<string, Set<EventListener>>();
  const delivered = new Map<string, Set<string>>();

  async function request<T>(path: string, schema: ResponseSchema<T>, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
    try {
      const response = await transport(`${baseUrl}${path}`, { ...init, signal: controller.signal });
      let body: unknown;
      try { body = await response.json(); } catch {
        throw new SessionClientError(response.status, 'INVALID_RESPONSE', 'The server returned an unreadable response. Refresh the session before trying again.', true);
      }
      if (!response.ok) {
        const result = ApiErrorSchema.safeParse(body);
        const error = result.success ? result.data.error : null;
        throw new SessionClientError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? 'The session request could not be completed.', error?.retryable ?? false, result.success ? result.data.state : undefined);
      }
      try { return schema.parse(body); } catch {
        throw new SessionClientError(response.status, 'INVALID_RESPONSE', 'The server response did not match the game contract. Your displayed progress has been preserved.', false);
      }
    } catch (error: unknown) {
      if (error instanceof SessionClientError) throw error;
      throw new SessionClientError(0, controller.signal.aborted ? 'TIMEOUT' : 'OFFLINE', controller.signal.aborted ? 'The request timed out. Retry with the same request ID or refresh the session.' : 'The server could not be reached. Your progress is preserved; reconnect and retry.', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  function post<T>(path: string, body: unknown, schema: ResponseSchema<T>) {
    return request(path, schema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function publish(sessionId: string, events: GameEvent[]) {
    const seen = delivered.get(sessionId) ?? new Set<string>();
    delivered.set(sessionId, seen);
    for (const event of events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      if (seen.size > 200) seen.delete(seen.values().next().value!);
      // Observer failures cannot turn a committed server response into a retry.
      for (const listener of listeners.get(sessionId) ?? []) { try { listener(event); } catch { /* isolated observer */ } }
    }
  }

  return {
    async createSession(input: CreateSessionInput): Promise<PublicState> {
      const response = await post('/sessions', CreateSessionRequestSchema.parse(input), StateResponseSchema);
      return response.state;
    },
    async getState(sessionId: string): Promise<PublicState> {
      const response = await request(`/sessions/${encodeURIComponent(sessionId)}`, StateResponseSchema);
      return response.state;
    },
    async act(sessionId: string, input: ActionRequest): Promise<ActionResult> {
      const response = await post(`/sessions/${encodeURIComponent(sessionId)}/actions`, ActionRequestSchema.parse(input), ActionResponseSchema);
      publish(sessionId, response.events);
      return response;
    },
    async sendTurn(sessionId: string, input: TurnRequest): Promise<TurnResponse> {
      const response = await post(`/sessions/${encodeURIComponent(sessionId)}/turns`, TurnRequestSchema.parse(input), TurnResponseSchema);
      publish(sessionId, response.events);
      return response;
    },
    /** Publishes committed action/turn response events; no socket server is required. */
    subscribe(sessionId: string, listener: EventListener): () => void {
      const subscribers = listeners.get(sessionId) ?? new Set<EventListener>();
      subscribers.add(listener);
      listeners.set(sessionId, subscribers);
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(sessionId);
      };
    },
  };
}

const sessionClient = createSessionClient();
export const { createSession, getState, act, sendTurn, subscribe: subscribeToEvents } = sessionClient;
