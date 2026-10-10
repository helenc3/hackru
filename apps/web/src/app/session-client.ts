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

/** A transport seam, not a fixture engine. Segment-001 implements these routes. */
export type CreateSessionInput = Pick<CreateSessionRequest, 'initialTier' | 'providerMode'>
  & Partial<Pick<CreateSessionRequest, 'validationMode' | 'inputPreference'>>;
export type ActionResult = ActionResponse;
export type EventListener = (event: GameEvent) => void;

export class SessionClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'SessionClientError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type ResponseSchema<T> = { parse: (input: unknown) => T };

export function createSessionClient(options: { baseUrl?: string; fetch?: typeof fetch } = {}) {
  const baseUrl = options.baseUrl ?? '/api';
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  const listeners = new Map<string, Set<EventListener>>();

  async function request<T>(path: string, schema: ResponseSchema<T>, init?: RequestInit): Promise<T> {
    const response = await transport(`${baseUrl}${path}`, init);
    const body: unknown = await response.json();
    if (!response.ok) {
      const result = ApiErrorSchema.safeParse(body);
      const error = result.success ? result.data.error : null;
      throw new SessionClientError(
        response.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? 'The session request could not be completed.',
        error?.retryable ?? false,
      );
    }
    return schema.parse(body);
  }

  function post<T>(path: string, body: unknown, schema: ResponseSchema<T>) {
    return request(path, schema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function publish(sessionId: string, events: GameEvent[]) {
    for (const event of events) {
      for (const listener of listeners.get(sessionId) ?? []) listener(event);
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
