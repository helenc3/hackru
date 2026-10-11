import { describe, expect, it } from 'vitest';
import { baselineInternalState, baselineTranscriptionRecord, BASELINE_NOW_MS } from '@vibequest/shared';
import { createSessionStore, invalidateAttemptArtifacts, registerSpeechJob, registerTranscription, resolveTranscription, updateSpeechJob, type SpeechJob } from '../../src/session-store.js';

const speech = (): SpeechJob => ({ id: 'speech-1', sessionId: baselineInternalState.sessionId, attemptId: baselineInternalState.attemptId, turnId: 'turn-1', replyZh: '一杯茶十元。', voiceKey: 'vendor', operationId: 'playback-1', status: 'pending' });

describe('atomic session storage and audio handoff', () => {
  it('serializes each session, allows other sessions, and releases a failed lock', async () => {
    const store = createSessionStore();
    const first = await store.create(baselineInternalState);
    const second = await store.create({ ...baselineInternalState, sessionId: 'other' });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const order: string[] = [];
    const one = store.withSession(first.id, async () => { order.push('start'); await blocked; order.push('end'); throw new Error('failed'); });
    const failure = expect(one).rejects.toThrow('failed');
    const two = store.withSession(first.id, async (session) => { order.push('next'); session.state.version++; });
    await store.withSession(second.id, async () => { order.push('other'); });
    expect(order).toEqual(['start', 'other']);
    release();
    await failure;
    await two;
    expect(order).toEqual(['start', 'other', 'end', 'next']);
    expect((await store.get(first.id))?.state.version).toBe(1);
    expect(baselineInternalState.version).toBe(0);
    await expect(store.withSession('unknown', async () => undefined)).rejects.toMatchObject({ status: 404 });
  });

  it('derives speech source from original text and rejects expired/unrelated records', async () => {
    const session = await createSessionStore().create(baselineInternalState);
    expect(registerTranscription(session, baselineTranscriptionRecord, BASELINE_NOW_MS)).toBe(true);
    const input = { text: baselineTranscriptionRecord.originalText, source: 'stt-edited' as const, transcriptionId: baselineTranscriptionRecord.id };
    expect(resolveTranscription(session, input, BASELINE_NOW_MS)).toEqual({ source: 'stt', originalSttText: input.text });
    expect(resolveTranscription(session, { ...input, text: '我要水。', source: 'stt' }, BASELINE_NOW_MS).source).toBe('stt-edited');
    expect(session.transcriptions.get(input.transcriptionId)?.editedText).toBe('我要水。');
    expect(session.transcriptions.get(input.transcriptionId)?.originalText).toBe(input.text);
    expect(() => resolveTranscription(session, input, baselineTranscriptionRecord.expiresAtMs)).toThrow('expired');
    expect(() => resolveTranscription(session, { ...input, transcriptionId: 'forged' }, BASELINE_NOW_MS)).toThrow('unknown');
    expect(() => resolveTranscription(session, { text: '你好', source: 'stt' }, BASELINE_NOW_MS)).toThrow('requires');
    expect(registerTranscription(session, { ...baselineTranscriptionRecord, id: 'other', sessionId: 'other' }, BASELINE_NOW_MS)).toBe(false);
    session.state.attemptId = 'new-attempt';
    expect(registerTranscription(session, { ...baselineTranscriptionRecord, id: 'late' }, BASELINE_NOW_MS)).toBe(false);
    expect(() => resolveTranscription(session, input, BASELINE_NOW_MS)).toThrow('another attempt');
  });

  it('registers replies once and rejects old-attempt speech completion after retry', async () => {
    const session = await createSessionStore().create(baselineInternalState);
    expect(registerSpeechJob(session, speech())).toBe(true);
    expect(() => registerSpeechJob(session, { ...speech(), id: 'duplicate' })).toThrow('already registered');
    expect(() => updateSpeechJob(session, 'speech-1', session.state.attemptId, { status: 'ready', assetDurationMs: 80_001, audio: new Uint8Array([1]) })).toThrow('bounded duration');
    expect(updateSpeechJob(session, 'speech-1', session.state.attemptId, { status: 'ready', assetDurationMs: 1_500, audio: new Uint8Array([1]) })).toBe(true);
    expect(updateSpeechJob(session, 'speech-1', session.state.attemptId, { status: 'failed' })).toBe(false);
    const oldAttempt = session.state.attemptId;
    invalidateAttemptArtifacts(session);
    session.state.attemptId = 'retry-attempt';
    expect(session.speechJobs.size).toBe(0);
    expect(registerSpeechJob(session, speech())).toBe(false);
    expect(updateSpeechJob(session, 'speech-1', oldAttempt, { status: 'failed' })).toBe(false);
    expect(session.state.xp).toBe(0);
  });

  it('abandonment resolves waiting clients without waiting for a provider', async () => {
    const session = await createSessionStore().create(baselineInternalState);
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
    const abandoned = expect(result).rejects.toMatchObject({ status: 409, code: 'ATTEMPT_ABANDONED', retryable: true });
    session.pendingRequests.set('turn-1', { sessionId: session.id, payload: '{}', attemptId: session.state.attemptId, result, resolve, reject });
    invalidateAttemptArtifacts(session);
    await abandoned;
    expect(session.abandonedRequestIds.has('turn-1')).toBe(true);
    expect(session.pendingRequests.size).toBe(0);
  });
});
