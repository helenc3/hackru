import { TranscriptionRecordSchema, type InternalState, type TranscriptionRecord, type TurnRequest, type InputSource } from '@vibequest/shared';
import { HttpError } from './errors.js';

export interface SpeechJob {
  id: string;
  sessionId: string;
  attemptId: string;
  turnId: string;
  replyZh: string;
  voiceKey: string;
  operationId: string;
  status: 'pending' | 'ready' | 'failed';
  assetDurationMs?: number;
  audio?: Uint8Array;
}

export interface RequestResult {
  payload: string;
  response: unknown;
}

export interface PendingRequest {
  sessionId: string;
  payload: string;
  attemptId: string;
  result: Promise<unknown>;
  resolve: (response: unknown) => void;
  reject: (error: unknown) => void;
}

/** Ephemeral registries are server-only; project state rather than this record. */
export interface SessionRecord {
  id: string;
  state: InternalState;
  transcriptions: Map<string, TranscriptionRecord>;
  speechJobs: Map<string, SpeechJob>;
  completedRequests: Map<string, RequestResult>;
  pendingRequests: Map<string, PendingRequest>;
  abandonedRequestIds: Set<string>;
  abandonedAudioOperationIds: Set<string>;
  modelCalls: number[];
  totalModelCalls: number;
}

export interface SessionStore {
  create(state: InternalState): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | undefined>;
  withSession<T>(
    sessionId: string,
    operation: (session: SessionRecord) => Promise<T>,
  ): Promise<T>;
}

export function createSessionStore(): SessionStore {
  const sessions = new Map<string, SessionRecord>();
  const tails = new Map<string, Promise<void>>();
  return {
    create: async (state) => {
      if (sessions.has(state.sessionId)) throw new HttpError(409, 'SESSION_EXISTS', 'Session already exists.');
      const record: SessionRecord = {
        id: state.sessionId, state: structuredClone(state), transcriptions: new Map(), speechJobs: new Map(),
        completedRequests: new Map(), pendingRequests: new Map(), abandonedRequestIds: new Set(), abandonedAudioOperationIds: new Set(), modelCalls: [], totalModelCalls: 0,
      };
      sessions.set(record.id, record);
      return record;
    },
    get: async (id) => sessions.get(id),
    withSession: async (id, operation) => {
      const previous = tails.get(id) ?? Promise.resolve();
      let release!: () => void;
      const tail = new Promise<void>((resolve) => { release = resolve; });
      tails.set(id, tail);
      await previous;
      try {
        const session = sessions.get(id);
        if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session expired or does not exist.');
        return await operation(session);
      } finally {
        release();
        if (tails.get(id) === tail) tails.delete(id);
      }
    },
  };
}

/** Call registry helpers only under withSession, after network work finishes. */
export function registerTranscription(session: SessionRecord, value: TranscriptionRecord, nowMs: number): boolean {
  const record = TranscriptionRecordSchema.parse(value);
  if (record.sessionId !== session.id || record.attemptId !== session.state.attemptId) return false;
  if (record.createdAtMs > nowMs || record.expiresAtMs <= nowMs) return false;
  if (session.transcriptions.has(record.id)) throw new HttpError(409, 'TRANSCRIPTION_EXISTS', 'Transcription ID already registered.');
  for (const [id, existing] of session.transcriptions) if (existing.expiresAtMs <= nowMs) session.transcriptions.delete(id);
  if (session.transcriptions.size >= 100) throw new HttpError(429, 'TRANSCRIPTION_LIMIT', 'Too many active transcriptions.');
  session.transcriptions.set(record.id, structuredClone(record));
  return true;
}

export function resolveTranscription(session: SessionRecord, input: TurnRequest['input'], nowMs: number): {
  source: InputSource; originalSttText?: string;
} {
  if (!input.transcriptionId) {
    if (input.source !== 'typed') throw new HttpError(422, 'INVALID_PROVENANCE', 'Speech input requires a valid transcription.');
    return { source: 'typed' };
  }
  const record = session.transcriptions.get(input.transcriptionId);
  if (!record || record.sessionId !== session.id || record.attemptId !== session.state.attemptId || record.expiresAtMs <= nowMs) {
    throw new HttpError(422, 'INVALID_PROVENANCE', 'Transcription is unknown, expired, or belongs to another attempt.');
  }
  const source = input.text === record.originalText ? 'stt' : 'stt-edited';
  if (source === 'stt-edited') record.editedText = input.text;
  return { source, originalSttText: record.originalText };
}

export function registerSpeechJob(session: SessionRecord, job: SpeechJob): boolean {
  if (job.sessionId !== session.id || job.attemptId !== session.state.attemptId) return false;
  if (job.status !== 'pending' || job.audio || job.assetDurationMs !== undefined || !job.replyZh.trim() || job.replyZh.length > 240) {
    throw new HttpError(422, 'INVALID_SPEECH_JOB', 'New speech jobs must contain a bounded committed reply and be pending.');
  }
  if (session.speechJobs.has(job.id) || [...session.speechJobs.values()].some((existing) => existing.turnId === job.turnId || existing.operationId === job.operationId)) {
    throw new HttpError(409, 'SPEECH_JOB_EXISTS', 'Speech job already registered for this turn or operation.');
  }
  if (session.speechJobs.size >= 100) throw new HttpError(429, 'SPEECH_JOB_LIMIT', 'Too many speech jobs.');
  session.speechJobs.set(job.id, structuredClone(job));
  return true;
}

export function updateSpeechJob(session: SessionRecord, id: string, attemptId: string,
  result: { status: 'failed' } | { status: 'ready'; assetDurationMs: number; audio: Uint8Array },
): boolean {
  const job = session.speechJobs.get(id);
  if (!job || attemptId !== session.state.attemptId || job.attemptId !== attemptId || job.status !== 'pending') return false;
  if (result.status === 'ready' && (!Number.isInteger(result.assetDurationMs) || result.assetDurationMs < 1 || result.assetDurationMs > 80_000 || result.audio.length === 0)) {
    throw new HttpError(422, 'INVALID_SPEECH_ASSET', 'Speech assets need audio and a bounded duration.');
  }
  Object.assign(job, structuredClone(result));
  return true;
}

export function invalidateAttemptArtifacts(session: SessionRecord): void {
  for (const operation of session.state.audioOperations) session.abandonedAudioOperationIds.add(operation.id);
  for (const job of session.speechJobs.values()) session.abandonedAudioOperationIds.add(job.operationId);
  session.transcriptions.clear();
  session.speechJobs.clear();
  for (const [id, pending] of session.pendingRequests) {
    session.abandonedRequestIds.add(id);
    pending.reject(new HttpError(409, 'ATTEMPT_ABANDONED', 'The mission was retried; submit a new turn ID.', true));
  }
  session.pendingRequests.clear();
  session.state.pendingTurn = null;
  session.state.audioOperations = [];
  session.state.activeAudioOperationId = null;
}
