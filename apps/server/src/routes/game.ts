import {
  ActionRequestSchema, CreateSessionRequestSchema, TurnRequestSchema, TurnResponseSchema, createGame, applyAction, applyEvaluation, isClosingLine, projectPublicState,
  synchronizeGame, dialogueContext, turnActions, createFixtureDialogueProvider, EngineRuleError, validateEvaluationForContext, npcIdentity,
  type PublicState, type TurnRequest, type TurnContext, type TurnResponse, type ActionResponse, type WorldView,
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
/** Every engine call sees the committed chunks of the session's world. */
const viewOf = (services: ServerServices, session: SessionRecord): WorldView => services.worlds.view(session.state.worldId);

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
  if (state.activeAudioOperationId) throw new HttpError(422, 'AUDIO_BUSY', 'Another audio operation is active.');
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
      try { state = await store.withSession(id, async (session) => { sync(session, Date.now()); return projectPublicState(session.state, Date.now(), viewOf(services, session)); }); } catch { /* Unknown/expired session has no recovery state. */ }
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
      const world = services.worlds.open(parsed.data.worldId);
      const session = await store.create(createGame({ sessionId: randomUUID(), worldId: world.worldId, attemptId: randomUUID(), missionId: 'Q1', initialTier: parsed.data.initialTier, validationMode: parsed.data.validationMode, inputPreference: parsed.data.inputPreference, providerStatus: parsed.data.providerMode === 'fixture' ? 'fixture' : 'live', spawn: world.spawn }, nowMs));
      response.status(201).json({ state: projectPublicState(session.state, nowMs, services.worlds.view(world.worldId)) });
    } catch (error) { await sendError(response, error); }
  });
  router.get('/sessions/:id', async (request, response) => {
    try {
      const { id } = sessionParamsSchema.parse(request.params);
      const state = await store.withSession(id, async (session) => { const nowMs = Date.now(); sync(session, nowMs); return projectPublicState(session.state, nowMs, viewOf(services, session)); });
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
        if (session.state.pendingTurn) throw new HttpError(409, 'TURN_PENDING', 'Wait for the pending turn.', true);
        const nowMs = Date.now(); sync(session, nowMs);
        if (body.action.type === 'audioPhase' && session.abandonedAudioOperationIds.has(body.action.operationId)) throw new HttpError(422, 'AUDIO_ATTEMPT_ABANDONED', 'Audio operation belongs to an abandoned attempt.');
        // Register playback on a detached candidate so rejected actions cannot mutate state.
        const candidate = { ...session, state: structuredClone(session.state) };
        if (body.action.type === 'audioPhase' && body.action.phase === 'playing') speechPlayback(candidate, body.action.operationId, nowMs);
        if (body.action.type === 'audioPhase' && body.action.phase === 'recording' && [...session.speechJobs.values()].some((job) => job.operationId === (body.action as { operationId: string }).operationId)) throw new HttpError(422, 'INVALID_AUDIO_OPERATION', 'Speech operations cannot be used for recording.');
        const world = viewOf(services, session);
        const engine = applyAction(candidate.state, body.action, nowMs, world);
        if (engine.state.attemptId !== session.state.attemptId) invalidateAttemptArtifacts(session);
        session.state = engine.state;
        session.state.version++;
        const outcome: ActionResponse = { state: projectPublicState(session.state, nowMs, world), events: engine.events };
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
    try { response.json(await runTurn(services, params.data.id, parsed.data)); } catch (error) { await sendError(response, error, params.data.id); }
  });
  return router;
}

export interface TurnOptions {
  /** HTTP turns check the client's version; server-initiated live-voice turns skip it. */
  checkVersion?: boolean;
  /** Live voice: the NPC already spoke. Resolves the spoken transcript instead of queuing a speech job. */
  spokenReply?: () => Promise<string | undefined>;
}

/** One evaluated dialogue turn: reservation, provider evaluation, engine commit. Shared by HTTP and live voice. */
export async function runTurn(services: ServerServices, id: string, body: TurnRequest, options: TurnOptions = {}): Promise<TurnResponse> {
  const store = services.sessionStore;
  const payload = semanticPayload('turn', { npcId: body.npcId, anchorId: body.anchorId, input: body.input });
  const reserved = await store.withSession(id, async (session) => {
    const cached = existing(session, body.turnId, payload);
    if (cached) return { cached };
    if (options.checkVersion !== false) version(session, body.expectedVersion);
    if (session.state.pendingTurn) throw new HttpError(409, 'TURN_PENDING', 'Wait for the pending turn.', true);
    const nowMs = Date.now(); sync(session, nowMs);
    const context = dialogueContext(session.state, body.npcId, body.anchorId, viewOf(services, session));
    if (session.state.activeAudioOperationId) throw new HttpError(422, 'AUDIO_BUSY', 'Finish the current audio operation before submitting.');
    const provenance = resolveTranscription(session, body.input, nowMs);
    session.modelCalls = session.modelCalls.filter((time) => time > nowMs - 60_000);
    // Three quests of up to NPC_PATIENCE_LIMIT exchanges each, plus retries, fit comfortably.
    if (session.totalModelCalls >= 120 || session.modelCalls.length >= 20) throw new HttpError(429, 'TURN_LIMIT', 'Session or per-minute turn budget reached.');
    session.totalModelCalls++; session.modelCalls.push(nowMs);
    let resolve!: PendingRequest['resolve']; let reject!: PendingRequest['reject'];
    const result = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
    void result.catch(() => undefined); // Abandonment may precede attachment of the waiter.
    const pending: PendingRequest = { sessionId: id, payload, attemptId: session.state.attemptId, result, resolve, reject };
    session.pendingRequests.set(body.turnId, pending);
    session.state.pendingTurn = { turnId: body.turnId, sessionId: id, attemptId: pending.attemptId, npcId: body.npcId, anchorId: body.anchorId, text: body.input.text, source: provenance.source, ...(body.input.transcriptionId ? { transcriptionId: body.input.transcriptionId, originalSttText: provenance.originalSttText } : {}), assisted: Boolean(session.state.flags['session.assisted']), createdAtMs: nowMs };
    if (!session.state.pauseReasons.includes('provider')) session.state.pauseReasons.push('provider');
    session.state.version++;
    return { pending, context, fixture: session.state.providerStatus === 'fixture' };
  });
  if ('cached' in reserved && reserved.cached) return (reserved.cached.pending ? await reserved.cached.pending : reserved.cached.response) as TurnResponse;
  if (!('pending' in reserved) || !reserved.pending || !reserved.context) throw new Error('Missing turn reservation.');
  void evaluate(services, body, reserved.pending, reserved.context, reserved.fixture ?? false, options);
  return await reserved.pending.result as TurnResponse;
}

async function evaluate(services: ServerServices, body: TurnRequest, pending: PendingRequest, context: TurnContext, fixture: boolean, options: TurnOptions): Promise<void> {
  const store = services.sessionStore;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const startedMs = Date.now();
  // §11 turn log: no keys, player audio or provider bodies.
  const log = (outcome: string, detail: string) => console.info(JSON.stringify({ turnId: body.turnId, elapsedMs: Date.now() - startedMs, provider: fixture ? 'fixture' : services.config.anthropicApiKey ? `claude:${services.config.anthropicModel}` : `gemini:${services.config.geminiModel}`, live: Boolean(options.spokenReply), outcome, detail }));
  try {
    const provider = fixture ? fixtureDialogue : services.dialogueProvider;
    const raw = await Promise.race([provider.evaluate(context, body.input.text), new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Provider timeout')), 8_000); })]);
    const evaluation = validateEvaluationForContext(raw, context, body.input.text);
    const spoken = options.spokenReply ? (await options.spokenReply())?.trim() : undefined;
    await store.withSession(pending.sessionId, async (session) => {
      if (session.state.attemptId !== pending.attemptId || session.pendingRequests.get(body.turnId) !== pending || session.state.pendingTurn?.turnId !== body.turnId) return;
      const nowMs = Date.now();
      const world = viewOf(services, session);
      const engine = applyEvaluation(session.state, body.npcId, body.anchorId, evaluation, nowMs, world);
      session.state = engine.state;
      session.state.pendingTurn = null;
      session.state.pauseReasons = session.state.pauseReasons.filter((reason) => reason !== 'provider');
      session.state.version++;
      // The engine's committed line (it may be a pacing question rather than the grounded fact reply).
      const replyZh = session.state.npcState[body.npcId].history.at(-1)!.text;
      // Verified directions are authoritative: the live model's own words never replace the route text.
      const verifiedRoute = engine.events.some((event) => event.kind === 'directions');
      let speech: { npcReply: string; speechId?: string };
      if (options.spokenReply) speech = { npcReply: spoken && !verifiedRoute && session.state.status !== 'failed' && spoken.length <= 240 ? spoken : replyZh }; // audio already streamed live; an NPC leaving in annoyance shows the authored line
      else {
        const speechId = randomUUID();
        const nameKey = world.anchor(body.anchorId)?.nameKey;
        registerSpeechJob(session, { id: speechId, sessionId: session.id, attemptId: pending.attemptId, turnId: body.turnId, replyZh, voiceKey: npcIdentity(nameKey) ? `npc:${nameKey}` : body.npcId, operationId: speechId, status: 'pending' });
        speech = { npcReply: replyZh, speechId };
      }
      const ended = Boolean(engine.conversationEnded || (evaluation.intent !== 'request_repeat' && isClosingLine(spoken)));
      const outcome: TurnResponse = TurnResponseSchema.parse({ turnId: body.turnId, state: projectPublicState(session.state, nowMs, world), events: engine.events, ...speech, actions: turnActions(session.state, body.anchorId, ended), ...(ended ? { conversationEnded: true } : {}), ...(evaluation.coach ? { feedback: evaluation.coach } : {}), vibe: { intent: evaluation.intentGrade.score, clarity: evaluation.clarity, courtesy: evaluation.courtesy } });
      session.pendingRequests.delete(body.turnId);
      session.completedRequests.set(body.turnId, { payload: pending.payload, response: outcome });
      pending.resolve(outcome);
      log('committed', `${evaluation.intent}/${evaluation.interaction} → ${engine.events.map((event) => event.kind).join(',') || 'no events'}`);
    });
  } catch (error) {
    log('failed', error instanceof HttpError || error instanceof EngineRuleError ? `${error.code}: ${error.message}`.slice(0, 160) : error instanceof Error ? error.message.slice(0, 160) : 'unknown');
    await store.withSession(pending.sessionId, async (session) => {
      if (session.state.attemptId !== pending.attemptId || session.pendingRequests.get(body.turnId) !== pending) return;
      sync(session, Date.now());
      session.state.pendingTurn = null;
      session.state.pauseReasons = session.state.pauseReasons.filter((reason) => reason !== 'provider');
      session.state.version++;
      session.pendingRequests.delete(body.turnId);
      pending.reject(new HttpError(503, 'PROVIDER_UNAVAILABLE', 'The provider response was unavailable or invalid. Retry with the current version.', true));
    });
  } finally { if (timeout) clearTimeout(timeout); }
}
