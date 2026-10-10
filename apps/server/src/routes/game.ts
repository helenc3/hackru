import {
  ActionRequestSchema, CreateSessionRequestSchema, TurnRequestSchema, TurnResponseSchema, createGame, applyAction, applyEvaluation, projectPublicState,
  synchronizeGame, dialogueContext, groundedReply, createFixtureDialogueProvider, EngineRuleError, validateEvaluationForContext,
  type PublicState, type TurnRequest, type TurnContext, type TurnResponse, type ActionResponse,
} from '@vibequest/shared';
import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { validationHarnessEnabled } from '../config.js';
import { HttpError } from '../errors.js';
import { invalidateAttemptArtifacts, registerSpeechJob, resolveTranscription, type SessionRecord, type PendingRequest } from '../session-store.js';
import type { ServerServices } from '../services.js';

const sessionParamsSchema = z.object({ id: z.string().min(1).max(128) });
const fixtureDialogue = createFixtureDialogueProvider();
const semanticPayload = (kind: 'action' | 'turn', value: unknown) => JSON.stringify({ kind, value });

function existing(session: SessionRecord, id: string, payload: string): { response?: unknown; pending?: Promise<unknown> } | undefined {
  if (session.abandonedRequestIds.has(id)) throw new HttpError(409, 'ATTEMPT_ABANDONED', 'Use a new request ID for this attempt.', true);
  const completed = session.completedRequests.get(id);
  const pending = session.pendingRequests.get(id);
  if (completed || pending) {
    if ((completed ?? pending)!.payload !== payload) throw new HttpError(409, 'ID_CONFLICT', 'This request ID was used for different input.');
    return completed ? { response: completed.response } : { pending: pending!.result };
  }
  return undefined;
}
function version(session: SessionRecord, expected: number): void {
  if (session.state.version !== expected) throw new HttpError(409, 'STALE_VERSION', 'Synchronize state and retry with its current version.', true);
}
function sync(session: SessionRecord, nowMs: number): void {
  const before = session.state;
  const result = synchronizeGame(before, nowMs);
  session.state = result.state;
  if (before.status !== result.state.status || result.events.length) session.state.version++;
}
function speechPlayback(session: SessionRecord, operationId: string, nowMs: number): void {
  const state = session.state;
  const existingOperation = state.audioOperations.find((entry) => entry.id === operationId);
  if (existingOperation) return; // Engine checks completed/current phase without extending its deadline.
  const job = [...session.speechJobs.values()].find((entry) => entry.operationId === operationId);
  if (!job || job.status !== 'ready' || job.attemptId !== state.attemptId || !job.assetDurationMs) throw new HttpError(422, 'SPEECH_NOT_READY', 'Playback requires a ready current-attempt speech job.');
  if (state.activeAudioOperationId || state.cuePlaybacks.some((entry) => !entry.delivered && !entry.interrupted)) throw new HttpError(422, 'AUDIO_BUSY', 'Another audio operation is active.');
  if (state.audioOperations.length >= 100) throw new HttpError(429, 'AUDIO_LIMIT', 'Too many audio operations.');
  state.audioOperations.push({ id: operationId, attemptId: state.attemptId, kind: 'playback', phase: 'playing', speechId: job.id, registeredAtMs: nowMs, phaseStartedAtMs: nowMs, phaseDeadlineMs: nowMs + job.assetDurationMs + 2_000, assetDurationMs: job.assetDurationMs, finished: false });
  state.activeAudioOperationId = operationId;
}

export function createGameRouter(services: ServerServices): Router {
  const router = Router();
  const store = services.sessionStore;
  const sendError = async (response: Response, error: unknown, id?: string): Promise<void> => {
    const known = error instanceof EngineRuleError ? new HttpError(422, error.code, error.message) : error instanceof HttpError ? error : new HttpError(500, 'INTERNAL_ERROR', 'The server could not process this request.');
    let state: PublicState | undefined;
    if (id) {
      try { state = await store.withSession(id, async (session) => { sync(session, Date.now()); return projectPublicState(session.state, Date.now()); }); } catch { /* Unknown/expired session has no recovery state. */ }
    }
    response.status(known.status).json({ error: { code: known.code, message: known.message, retryable: known.retryable }, ...(state ? { state } : {}) });
  };
  router.post('/sessions', async (request, response) => {
    try {
      const parsed = CreateSessionRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'INVALID_REQUEST', 'Invalid create-session request.');
      if (parsed.data.validationMode && !validationHarnessEnabled(services.config)) throw new HttpError(422, 'VALIDATION_DISABLED', 'The validation harness is unavailable.');
      if (parsed.data.providerMode === 'fixture' && !services.config.enableDemoFixtures) throw new HttpError(422, 'FIXTURES_DISABLED', 'Fixture sessions are disabled.');
      const nowMs = Date.now();
      const session = await store.create(createGame({ sessionId: randomUUID(), attemptId: randomUUID(), missionId: 'P1', initialTier: parsed.data.initialTier, validationMode: parsed.data.validationMode, inputPreference: parsed.data.inputPreference, providerStatus: parsed.data.providerMode === 'fixture' ? 'fixture' : 'live' }, nowMs));
      response.status(201).json({ state: projectPublicState(session.state, nowMs) });
    } catch (error) { await sendError(response, error); }
  });
  router.get('/sessions/:id', async (request, response) => {
    try {
      const { id } = sessionParamsSchema.parse(request.params);
      const state = await store.withSession(id, async (session) => { const nowMs = Date.now(); sync(session, nowMs); return projectPublicState(session.state, nowMs); });
      response.json({ state });
    } catch (error) { await sendError(response, error instanceof z.ZodError ? new HttpError(400, 'INVALID_REQUEST', 'Invalid session identifier.') : error); }
  });
  router.post('/sessions/:id/actions', async (request, response) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const parsed = ActionRequestSchema.safeParse(request.body);
    if (!params.success || !parsed.success) { await sendError(response, new HttpError(400, 'INVALID_REQUEST', 'Invalid action request.')); return; }
    const id = params.data.id;
    try {
      const body = parsed.data;
      const payload = semanticPayload('action', body.action);
      const result = await store.withSession(id, async (session) => {
        const cached = existing(session, body.actionId, payload);
        if (cached) return cached.response;
        version(session, body.expectedVersion);
        if (session.state.pendingTurn && body.action.type !== 'retryMission') throw new HttpError(409, 'TURN_PENDING', 'Wait for the pending turn or retry the mission.', true);
        const nowMs = Date.now(); sync(session, nowMs);
        if (body.action.type === 'audioPhase' && session.abandonedAudioOperationIds.has(body.action.operationId)) throw new HttpError(422, 'AUDIO_ATTEMPT_ABANDONED', 'Audio operation belongs to an abandoned attempt.');
        // Register playback on a detached candidate so rejected actions cannot mutate state.
        const candidate = { ...session, state: structuredClone(session.state) };
        if (body.action.type === 'audioPhase' && body.action.phase === 'playing') speechPlayback(candidate, body.action.operationId, nowMs);
        if (body.action.type === 'audioPhase' && body.action.phase === 'recording' && [...session.speechJobs.values()].some((job) => job.operationId === (body.action as { operationId: string }).operationId)) throw new HttpError(422, 'INVALID_AUDIO_OPERATION', 'Speech operations cannot be used for recording.');
        const engine = applyAction(candidate.state, body.action, nowMs);
        if (engine.state.attemptId !== session.state.attemptId) invalidateAttemptArtifacts(session);
        session.state = engine.state;
        session.state.version++;
        const outcome: ActionResponse = { state: projectPublicState(session.state, nowMs), events: engine.events };
        session.completedRequests.set(body.actionId, { payload, response: outcome });
        return outcome;
      });
      response.json(result);
    } catch (error) { await sendError(response, error, id); }
  });
  router.post('/sessions/:id/turns', async (request, response) => {
    const params = sessionParamsSchema.safeParse(request.params);
    const parsed = TurnRequestSchema.safeParse(request.body);
    if (!params.success || !parsed.success) { await sendError(response, new HttpError(400, 'INVALID_REQUEST', 'Invalid dialogue turn request.')); return; }
    const id = params.data.id;
    try {
      const body = parsed.data;
      const payload = semanticPayload('turn', { npcId: body.npcId, input: body.input });
      const reserved = await store.withSession(id, async (session) => {
        const cached = existing(session, body.turnId, payload);
        if (cached) return { cached };
        version(session, body.expectedVersion);
        if (session.state.pendingTurn) throw new HttpError(409, 'TURN_PENDING', 'Wait for the pending turn or retry the mission.', true);
        const nowMs = Date.now(); sync(session, nowMs);
        const context = dialogueContext(session.state, body.npcId);
        if (session.state.activeAudioOperationId) throw new HttpError(422, 'AUDIO_BUSY', 'Finish the current audio operation before submitting.');
        if (session.state.cuePlaybacks.some((entry) => !entry.delivered && !entry.interrupted)) throw new HttpError(422, 'AUDIO_BUSY', 'Wait for cue playback to finish.');
        const provenance = resolveTranscription(session, body.input, nowMs);
        session.modelCalls = session.modelCalls.filter((time) => time > nowMs - 60_000);
        if (session.totalModelCalls >= 30 || session.modelCalls.length >= 10) throw new HttpError(429, 'TURN_LIMIT', 'Session or per-minute turn budget reached.');
        session.totalModelCalls++; session.modelCalls.push(nowMs);
        let resolve!: PendingRequest['resolve']; let reject!: PendingRequest['reject'];
        const result = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
        void result.catch(() => undefined); // Abandonment may precede attachment of the HTTP waiter.
        const pending: PendingRequest = { sessionId: id, payload, attemptId: session.state.attemptId, result, resolve, reject };
        session.pendingRequests.set(body.turnId, pending);
        session.state.pendingTurn = { turnId: body.turnId, sessionId: id, attemptId: pending.attemptId, npcId: body.npcId, text: body.input.text, source: provenance.source, ...(body.input.transcriptionId ? { transcriptionId: body.input.transcriptionId, originalSttText: provenance.originalSttText } : {}), assisted: Boolean(session.state.flags['session.assisted']), createdAtMs: nowMs };
        if (!session.state.timer!.pauseReasons.includes('provider')) session.state.timer!.pauseReasons.push('provider');
        session.state.version++;
        return { pending, context, fixture: session.state.providerStatus === 'fixture' };
      });
      if ('cached' in reserved && reserved.cached) { response.json(reserved.cached.pending ? await reserved.cached.pending : reserved.cached.response); return; }
      if (!('pending' in reserved) || !reserved.pending || !reserved.context) throw new Error('Missing turn reservation.');
      void evaluate(body, reserved.pending, reserved.context, reserved.fixture ?? false);
      response.json(await reserved.pending.result);
    } catch (error) { await sendError(response, error, id); }
  });

  async function evaluate(body: TurnRequest, pending: PendingRequest, context: TurnContext, fixture: boolean): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const provider = fixture ? fixtureDialogue : services.dialogueProvider;
      const raw = await Promise.race([provider.evaluate(context, body.input.text), new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Provider timeout')), 8_000); })]);
      const evaluation = validateEvaluationForContext(raw, context, body.input.text);
      await store.withSession(contextSessionId(), async (session) => {
        if (session.state.attemptId !== pending.attemptId || session.pendingRequests.get(body.turnId) !== pending || session.state.pendingTurn?.turnId !== body.turnId) return;
        const nowMs = Date.now();
        const engine = applyEvaluation(session.state, body.npcId, evaluation, nowMs);
        session.state = engine.state;
        session.state.pendingTurn = null;
        session.state.timer!.pauseReasons = session.state.timer!.pauseReasons.filter((reason) => reason !== 'provider');
        session.state.version++;
        const speechId = randomUUID();
        registerSpeechJob(session, { id: speechId, sessionId: session.id, attemptId: pending.attemptId, turnId: body.turnId, replyZh: groundedReply(session.state, body.npcId, evaluation), voiceKey: body.npcId, operationId: speechId, status: 'pending' });
        const outcome: TurnResponse = TurnResponseSchema.parse({ turnId: body.turnId, state: projectPublicState(session.state, nowMs), events: engine.events, npcReply: session.speechJobs.get(speechId)!.replyZh, speechId, ...(session.state.mode === 'practice' ? { ...(evaluation.coach ? { feedback: evaluation.coach } : {}), vibe: { intent: evaluation.intentGrade.score, clarity: evaluation.clarity, courtesy: evaluation.courtesy } } : {}) });
        session.pendingRequests.delete(body.turnId);
        session.completedRequests.set(body.turnId, { payload: pending.payload, response: outcome });
        pending.resolve(outcome);
      });
    } catch {
      await store.withSession(contextSessionId(), async (session) => {
        if (session.state.attemptId !== pending.attemptId || session.pendingRequests.get(body.turnId) !== pending) return;
        sync(session, Date.now());
        session.state.pendingTurn = null;
        session.state.timer!.pauseReasons = session.state.timer!.pauseReasons.filter((reason) => reason !== 'provider');
        session.state.version++;
        session.pendingRequests.delete(body.turnId);
        pending.reject(new HttpError(503, 'PROVIDER_UNAVAILABLE', 'The provider response was unavailable or invalid. Retry with the current version.', true));
      });
    } finally { if (timeout) clearTimeout(timeout); }
    function contextSessionId(): string { return pending.sessionId; }
  }
  return router;
}
