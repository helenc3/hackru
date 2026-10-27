import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TranscriptionResponseSchema, type GameLanguage } from '@vibequest/shared';
import { HttpError } from '../errors.js';
import { MAX_CLIP_BYTES, mp3DurationMs } from '../providers/elevenlabs/live.js';
import { registerTranscription, updateSpeechJob } from '../session-store.js';
import type { ServerServices } from '../services.js';

export const MAX_TRANSCRIPTION_REQUEST_BYTES = 3 * 1024 * 1024;
export const TRANSCRIPTION_TTL_MS = 5 * 60_000;
const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac']);
const idSchema = z.string().min(1).max(128);
const sessionParamsSchema = z.object({ id: idSchema });
const speechParamsSchema = sessionParamsSchema.extend({ speechId: idSchema });

type Synthesis = { language: GameLanguage; text: string; voiceKey: string; attemptId: string };
type SpeechLookup = { kind: 'ready'; audio: Uint8Array; durationMs: number } | { kind: 'pending' } | { kind: 'start'; job: Synthesis };

export function createAudioRouter(services: ServerServices): Router {
  const router = Router();
  const store = services.sessionStore;
  const synthesizing = new Set<string>(); // speech job IDs with a provider call in flight

  async function synthesize(sessionId: string, speechId: string, job: Synthesis): Promise<void> {
    let audio: Uint8Array | undefined;
    try { audio = await services.speechProvider.synthesize(job.text, job.voiceKey, job.language); } catch { audio = undefined; }
    try {
      // updateSpeechJob drops results for a retried attempt or an invalidated job.
      await store.withSession(sessionId, async (session) => {
        if (!audio) return updateSpeechJob(session, speechId, job.attemptId, { status: 'failed' });
        try {
          return updateSpeechJob(session, speechId, job.attemptId, { status: 'ready', audio, assetDurationMs: mp3DurationMs(audio) });
        } catch {
          return updateSpeechJob(session, speechId, job.attemptId, { status: 'failed' });
        }
      });
    } catch { /* Session expired while synthesizing. */ } finally {
      synthesizing.delete(speechId);
    }
  }

  router.get('/sessions/:id/speech/:speechId', async (request, response, next) => {
    const params = speechParamsSchema.safeParse(request.params);
    if (!params.success) return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid speech identifier.'));
    const { id, speechId } = params.data;
    try {
      const result = await store.withSession(id, async (session): Promise<SpeechLookup> => {
        const job = session.speechJobs.get(speechId);
        if (!job) {
          if (session.abandonedAudioOperationIds.has(speechId)) throw new HttpError(410, 'SPEECH_INVALIDATED', 'This reply belongs to an earlier attempt.');
          throw new HttpError(404, 'SPEECH_NOT_FOUND', 'Unknown speech ID.');
        }
        if (job.sessionId !== session.id) throw new HttpError(404, 'SPEECH_NOT_FOUND', 'Unknown speech ID.');
        if (job.attemptId !== session.state.attemptId) throw new HttpError(410, 'SPEECH_INVALIDATED', 'This reply belongs to an earlier attempt.');
        if (job.status === 'failed') throw new HttpError(410, 'SPEECH_FAILED', 'Speech could not be generated; use the reply subtitle.');
        if (job.status === 'ready') return { kind: 'ready', audio: job.audio!, durationMs: job.assetDurationMs! };
        if (synthesizing.has(job.id)) return { kind: 'pending' };
        synthesizing.add(job.id);
        return { kind: 'start', job: { language: session.state.language, text: job.replyZh, voiceKey: job.voiceKey, attemptId: job.attemptId } };
      });
      if (result.kind === 'ready') {
        response.set('X-Asset-Duration-Ms', String(result.durationMs)).type('audio/mpeg').send(Buffer.from(result.audio));
        return;
      }
      if (result.kind === 'start') void synthesize(id, speechId, result.job); // outside the session lock
      response.status(202).set('Retry-After', '1').json({ status: 'pending' });
    } catch (error) { next(error); }
  });

  router.post(
    '/sessions/:id/transcriptions',
    express.raw({ type: 'multipart/form-data', limit: MAX_TRANSCRIPTION_REQUEST_BYTES }),
    async (request, response, next) => {
      const params = sessionParamsSchema.safeParse(request.params);
      if (!params.success) return next(new HttpError(400, 'INVALID_REQUEST', 'Invalid session identifier.'));
      const contentType = request.get('content-type') ?? '';
      if (!/^multipart\/form-data\s*;.*\bboundary=(?:"[^"]+"|[^;\s]+)/i.test(contentType) || !Buffer.isBuffer(request.body)) {
        return next(new HttpError(400, 'INVALID_REQUEST', 'A multipart audio clip is required.'));
      }
      const { id } = params.data;
      try {
        let form: FormData;
        try { form = await new Response(request.body as unknown as BodyInit, { headers: { 'content-type': contentType } }).formData(); } catch {
          throw new HttpError(400, 'INVALID_REQUEST', 'A multipart audio clip is required.');
        }
        const clip = form.get('audio');
        const operationId = form.get('operationId');
        if (!(clip instanceof Blob) || typeof operationId !== 'string') throw new HttpError(400, 'INVALID_REQUEST', 'Send an audio file and its recording operationId.');
        if (clip.size === 0 || clip.size > MAX_CLIP_BYTES) throw new HttpError(413, 'CLIP_TOO_LARGE', 'Clips must be between 1 byte and 3 MB.');
        const mimeType = clip.type.split(';')[0]!.trim().toLowerCase();
        if (!ALLOWED_AUDIO_TYPES.has(mimeType)) throw new HttpError(415, 'UNSUPPORTED_AUDIO', 'Unsupported audio type; record again or type your request.', true);

        // Short lock: bind to the current attempt and its active recording operation.
        const capture = await store.withSession(id, async (session) => {
          const state = session.state;
          const operation = state.audioOperations.find((entry) => entry.id === operationId && entry.attemptId === state.attemptId);
          if (!operation || operation.kind !== 'recording' || operation.finished || state.activeAudioOperationId !== operationId || !['recording', 'transcribing'].includes(operation.phase)) {
            throw new HttpError(422, 'NO_ACTIVE_RECORDING', 'Start a recording operation before transcribing.');
          }
          return { attemptId: state.attemptId, language: state.language };
        });

        let audio: Uint8Array | undefined = new Uint8Array(await clip.arrayBuffer());
        let text: string;
        try { text = (await services.speechProvider.transcribe(audio, mimeType, capture.language)).trim(); } finally { audio = undefined; } // drop the clip
        if (!text) throw new HttpError(422, 'EMPTY_TRANSCRIPT', 'Nothing was recognized; record again or type your request.', true);
        if (text.length > 500) throw new HttpError(422, 'TRANSCRIPT_TOO_LONG', 'Recognized text is too long; record a shorter request.', true);

        const result = await store.withSession(id, async (session) => {
          const nowMs = Date.now();
          if (session.state.attemptId !== capture.attemptId) throw new HttpError(409, 'ATTEMPT_ABANDONED', 'The mission was retried; record again.', true);
          const record = { id: randomUUID(), sessionId: session.id, attemptId: capture.attemptId, originalText: text, createdAtMs: nowMs, expiresAtMs: nowMs + TRANSCRIPTION_TTL_MS };
          if (!registerTranscription(session, record, nowMs)) throw new HttpError(409, 'ATTEMPT_ABANDONED', 'The mission was retried; record again.', true);
          return TranscriptionResponseSchema.parse({ text, transcriptionId: record.id });
        });
        response.json(result); // Never creates a turn: only Send does.
      } catch (error) { next(error); }
    },
  );

  return router;
}
