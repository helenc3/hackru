import { useCallback, useEffect, useRef, useState } from 'react';
import { NpcIdSchema, type CreateSessionRequest, type GameAction, type GameEvent, type PublicState, type TurnRequest, type TurnResponse } from '@vibequest/shared';
import { act, createSession, getState, sendTurn, SessionClientError } from './session-client';

export type UiProblem = { code: string; message: string; retryable: boolean; expired: boolean };
const storageKey = (validation: boolean) => validation ? 'vibequest.validation-session.v1' : 'vibequest.player-session.v1';
function stored(validation: boolean): string | null { try { return localStorage.getItem(storageKey(validation)); } catch { return null; } }
function remember(validation: boolean, id: string | null) { try { if (id) localStorage.setItem(storageKey(validation), id); else localStorage.removeItem(storageKey(validation)); } catch { /* storage can be unavailable in private mode */ } }

/** UI coordinator only: every transition and reward comes from a schema-checked server response. */
export function useSession(validation: boolean) {
  const [state, setState] = useState<PublicState | null>(null);
  const current = useRef<PublicState | null>(null);
  const [resumeId, setResumeId] = useState(() => stored(validation));
  const [pending, setPending] = useState(0);
  const [turnPending, setTurnPending] = useState(false);
  const activeTurn = useRef<string | null>(null);
  const [problem, setProblem] = useState<UiProblem | null>(null);
  const [turn, setTurn] = useState<TurnResponse | null>(null);
  const [turnNpc, setTurnNpc] = useState<string | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const generation = useRef(0);
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const retry = useRef<(() => Promise<void>) | null>(null);

  const accept = useCallback((next: PublicState, token: number) => {
    if (token !== generation.current) return;
    if (next.validationMode !== validation) throw new SessionClientError(422, 'SESSION_KIND_MISMATCH', 'This session belongs to a different environment. Start a fresh session.', false);
    if (current.current?.sessionId === next.sessionId && next.version < current.current.version) return;
    current.current = next;
    setState(next);
    remember(validation, next.sessionId);
    setResumeId(next.sessionId);
  }, [validation]);

  const report = useCallback((error: unknown, token: number) => {
    if (token !== generation.current) return;
    const failure = error instanceof SessionClientError ? error : new SessionClientError(0, 'CLIENT_ERROR', 'The request could not be completed. Refresh the session.', false);
    if (failure.state) accept(failure.state, token);
    const expired = failure.status === 404 && /SESSION|EXPIRED/.test(failure.code);
    if (expired) { remember(validation, null); setResumeId(null); }
    setProblem({ code: failure.code, message: failure.message, retryable: failure.retryable, expired });
  }, [accept, validation]);

  const enqueue = useCallback((task: (token: number) => Promise<void>, token = generation.current): Promise<void> => {
    setPending((count) => count + 1);
    const execution = tail.current.catch(() => undefined).then(async () => {
      if (token !== generation.current) return;
      setProblem(null);
      try { await task(token); if (token === generation.current) retry.current = null; } catch (error: unknown) {
        report(error, token);
        if (token === generation.current) retry.current = () => enqueue(task, token);
        throw error;
      }
    }).finally(() => { if (token === generation.current) setPending((count) => Math.max(0, count - 1)); });
    tail.current = execution.catch(() => undefined);
    return execution;
  }, [report]);

  const refresh = useCallback(async () => {
    const id = current.current?.sessionId ?? resumeId;
    if (!id) return;
    await enqueue(async (token) => accept(await getState(id), token));
  }, [accept, enqueue, resumeId]);

  const start = useCallback(async (options: CreateSessionRequest) => {
    if (pending) return;
    const token = ++generation.current;
    current.current = null; setState(null); setTurn(null); setEvents([]);
    await enqueue(async (active) => accept(await createSession({ ...options, validationMode: validation }), active), token);
  }, [accept, enqueue, pending, validation]);

  const onAction = useCallback(async (action: GameAction) => {
    // A mission retry must not wait behind a provider call. Invalidate old UI callbacks
    // and fetch the server's reserved version before requesting a fresh attempt.
    const interrupted = action.type === 'retryMission' && activeTurn.current !== null;
    if (interrupted) {
      generation.current++; tail.current = Promise.resolve(); setPending(0);
      activeTurn.current = null; setTurnPending(false); retry.current = null;
      setTurn(null); setTurnNpc(null); setEvents([]);
    }
    const scope = generation.current;
    const actionId = crypto.randomUUID();
    // Build the version at dispatch, after earlier movement/audio/turn actions commit.
    let input: Parameters<typeof act>[1] | undefined;
    await enqueue(async (token) => {
      if (interrupted && current.current) accept(await getState(current.current.sessionId), token);
      const snapshot = current.current;
      if (!snapshot || snapshot.status !== 'active' && !['retryMission', 'startMission', 'setInputPreference', 'audioPhase', 'finishCue'].includes(action.type)) throw new SessionClientError(422, 'NO_ACTIVE_SESSION', 'Start or resume a session before interacting.', false);
      input = { actionId, expectedVersion: snapshot.version, action };
      const response = await act(snapshot.sessionId, input);
      if (token !== generation.current) return;
      accept(response.state, token);
      setEvents((previous) => [...previous, ...response.events.filter((event) => !previous.some((known) => known.id === event.id))].slice(-8));
      if (action.type === 'retryMission' || action.type === 'startMission') { setTurn(null); setTurnNpc(null); setEvents(response.events); }
    }, scope);
  }, [accept, enqueue]);

  const submit = useCallback(async (npcId: string, input: TurnRequest['input']) => {
    const id = NpcIdSchema.parse(npcId);
    const turnId = crypto.randomUUID();
    let request: TurnRequest | undefined;
    await enqueue(async (token) => {
      // Failed provider bookkeeping can advance the version. Preserve semantic
      // input/ID while synchronizing the version for a retry.
      if (request && current.current) accept(await getState(current.current.sessionId), token);
      const snapshot = current.current;
      if (!snapshot || snapshot.status !== 'active') throw new SessionClientError(422, 'NO_ACTIVE_SESSION', 'There is no active conversation.', false);
      request = { turnId, expectedVersion: snapshot.version, npcId: id, input };
      activeTurn.current = turnId; setTurnPending(true);
      let response: TurnResponse;
      try { response = await sendTurn(snapshot.sessionId, request); } finally {
        if (activeTurn.current === turnId) { activeTurn.current = null; setTurnPending(false); }
      }
      if (token !== generation.current) return;
      accept(response.state, token);
      if (token === generation.current && response.state.version >= (current.current?.version ?? 0)) { setTurn(response); setTurnNpc(id); }
      setEvents((previous) => [...previous, ...response.events.filter((event) => !previous.some((known) => known.id === event.id))].slice(-8));
    });
  }, [accept, enqueue]);

  /** A live-voice turn evaluated server-side over the WebSocket: same bookkeeping as a POST /turns response. */
  const applyTurn = useCallback((npcId: string, response: TurnResponse) => {
    const id = NpcIdSchema.parse(npcId);
    const token = generation.current;
    accept(response.state, token);
    if (response.state.version >= (current.current?.version ?? 0)) { setTurn(response); setTurnNpc(id); }
    setEvents((previous) => [...previous, ...response.events.filter((event) => !previous.some((known) => known.id === event.id))].slice(-8));
  }, [accept]);

  const abandon = useCallback(() => {
    generation.current++; current.current = null; setState(null); setTurn(null); setEvents([]); setProblem(null);
    tail.current = Promise.resolve(); setPending(0); activeTurn.current = null; setTurnPending(false);
    retry.current = null; remember(validation, null); setResumeId(null);
  }, [validation]);

  useEffect(() => {
    if (!state?.timer || state.status !== 'active' || problem) return;
    const interval = setInterval(() => { if (!pending) void refresh().catch(() => undefined); }, 3000);
    return () => clearInterval(interval);
  }, [state?.sessionId, state?.timer, state?.status, pending, problem, refresh]);

  return { state, pending: pending > 0, turnPending, problem, turn, turnNpc, events, resumeId, start, refresh, onAction, submit, applyTurn, abandon,
    retry: async () => { await retry.current?.(); }, dismiss: () => setProblem(null) };
}
