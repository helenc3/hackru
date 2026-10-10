import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createFixtureDialogueProvider, type TurnEvaluation } from '@vibequest/shared';
import { campaign } from './helpers.js';
import { registerTranscription, updateSpeechJob } from '../../src/session-store.js';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function prepared() {
  const game = await campaign('live');
  game.services.dialogueProvider.evaluate = createFixtureDialogueProvider().evaluate;
  // Services are injected by reference; assign its existing provider method.
  await game.move('cafe'); await game.inspect('p1.entrance-sign'); await game.choose('p1.enter-plaza-door');
  return game;
}

describe('reservation, idempotency and audio integrity', () => {
  it('returns completed duplicates before stale-version rejection and conflicts on changed payloads', async () => {
    const game = await campaign();
    const path = `/api/sessions/${game.state.sessionId}/actions`;
    const body = { actionId: 'same-action', expectedVersion: game.state.version, action: { type: 'moveZone', zoneId: 'cafe' } };
    const first = await request(game.app).post(path).send(body).expect(200);
    const duplicate = await request(game.app).post(path).send({ ...body, expectedVersion: 999 }).expect(200);
    expect(duplicate.body).toEqual(first.body);
    await request(game.app).post(path).send({ ...body, action: { type: 'moveZone', zoneId: 'concourse' } }).expect(409);
    const stale = await request(game.app).post(path).send({ ...body, actionId: 'fresh-id' }).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
  });
  it('shares pending duplicates, permits retry immediately, and discards the old result', async () => {
    const game = await prepared();
    const output = deferred<TurnEvaluation>(); const started = deferred<void>(); let calls = 0;
    game.services.dialogueProvider.evaluate = async () => { calls++; started.resolve(); return output.promise; };
    const path = `/api/sessions/${game.state.sessionId}`;
    const body = { turnId: 'pending-turn', expectedVersion: game.state.version, npcId: 'xiaolin', input: { text: '我要茶。', source: 'typed' } };
    const first = request(game.app).post(`${path}/turns`).send(body).then((response) => response);
    await started.promise;
    const duplicate = request(game.app).post(`${path}/turns`).send({ ...body, expectedVersion: 0 }).then((response) => response);
    const reserved = await request(game.app).get(path).expect(200);
    expect(reserved.body.state.version).toBe(body.expectedVersion + 1);
    await request(game.app).post(`${path}/turns`).send({ ...body, input: { text: '我要水。', source: 'typed' } }).expect(409);
    await request(game.app).post(`${path}/actions`).send({ actionId: 'blocked', expectedVersion: reserved.body.state.version, action: { type: 'moveZone', zoneId: 'cafe' } }).expect(409);
    const retry = await request(game.app).post(`${path}/actions`).send({ actionId: 'retry', expectedVersion: reserved.body.state.version, action: { type: 'retryMission' } }).expect(200);
    expect(retry.body.state.status).toBe('active');
    for (const response of await Promise.all([first, duplicate])) expect(response.body.error.code).toBe('ATTEMPT_ABANDONED');
    expect(calls).toBe(1);
    const oldReply = await createFixtureDialogueProvider().evaluate({ missionId: 'P1', mode: 'practice', tier: 1, npcId: 'xiaolin', persona: 'cafe', patience: 5, allowedIntents: ['order_drink'], facts: {}, history: [] }, '我要茶。');
    output.resolve(oldReply);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    const session = (await game.services.sessionStore.get(game.state.sessionId))!;
    expect(session.state).toMatchObject({ nodeId: 'p1.entrance', xp: 0, pendingTurn: null, version: retry.body.state.version });
    expect(session.speechJobs.size).toBe(0);
    expect(session.state.timer!.pauseReasons).toEqual([]);
    await request(game.app).post(`${path}/turns`).send({ ...body, expectedVersion: retry.body.state.version }).expect(409);
  });
  it('allows failed-provider retry with the same ID and rejects malformed evaluations without quest changes', async () => {
    const game = await prepared();
    let calls = 0;
    const fixture = createFixtureDialogueProvider();
    game.services.dialogueProvider.evaluate = async (context, text) => { calls++; if (calls === 1) throw new Error('offline'); if (calls === 2) return { ...(await fixture.evaluate(context, text)), slots: [{ key: 'drink', value: 'invented' }] } as unknown as TurnEvaluation; return fixture.evaluate(context, text); };
    const path = `/api/sessions/${game.state.sessionId}/turns`;
    const body = { turnId: 'retry-provider', expectedVersion: game.state.version, npcId: 'xiaolin', input: { text: '我要茶。', source: 'typed' } };
    for (let index = 0; index < 2; index++) {
      const failure = await request(game.app).post(path).send(body).expect(503);
      expect(failure.body.error.retryable).toBe(true);
      expect(failure.body.state).toMatchObject({ xp: 0, status: 'active' });
      const session = (await game.services.sessionStore.get(game.state.sessionId))!;
      expect(session.state.flags['p1.drink']).toBeUndefined(); expect(session.state.npcState.xiaolin.patience).toBe(5); expect(session.speechJobs.size).toBe(0);
      body.expectedVersion = failure.body.state.version;
    }
    const success = await request(game.app).post(path).send(body).expect(200);
    const duplicate = await request(game.app).post(path).send({ ...body, expectedVersion: 0 }).expect(200);
    expect(duplicate.body).toEqual(success.body); expect(calls).toBe(3);
    expect((await game.services.sessionStore.get(game.state.sessionId))!.speechJobs.size).toBe(1);
  });
  it('derives verified STT, binds speech jobs, and prevents callback renewal or old-attempt playback', async () => {
    const game = await campaign();
    await game.move('cafe'); await game.inspect('p1.entrance-sign'); await game.choose('p1.enter-plaza-door');
    const session = (await game.services.sessionStore.get(game.state.sessionId))!;
    const path = `/api/sessions/${session.id}`;
    const original = '我要茶。';
    await game.services.sessionStore.withSession(session.id, async (record) => {
      registerTranscription(record, { id: 'transcription-1', sessionId: session.id, attemptId: session.state.attemptId, originalText: original, createdAtMs: Date.now(), expiresAtMs: Date.now() + 60_000 }, Date.now());
    });
    const turn = await request(game.app).post(`${path}/turns`).send({ turnId: 'stt-turn', expectedVersion: session.state.version, npcId: 'xiaolin', input: { text: original, source: 'stt-edited', transcriptionId: 'transcription-1' } }).expect(200);
    expect(session.state.evidence.find((entry) => entry.turnId === 'stt-turn')?.conversationSource).toBe('spoken');
    const speechId = turn.body.speechId;
    const job = session.speechJobs.get(speechId)!;
    expect(job).toMatchObject({ sessionId: session.id, attemptId: session.state.attemptId, turnId: 'stt-turn', replyZh: '一杯茶十元。请确认饮料和价格。', status: 'pending' });
    await game.act({ type: 'audioPhase', operationId: 'unknown-playback', phase: 'playing' }, 409); // stale helper version
    const action = async (actionId: string, value: unknown, status = 200) => request(game.app).post(`${path}/actions`).send({ actionId, expectedVersion: session.state.version, action: value }).expect(status);
    await action('not-ready', { type: 'audioPhase', operationId: job.operationId, phase: 'playing' }, 422);
    await game.services.sessionStore.withSession(session.id, async (record) => { updateSpeechJob(record, job.id, record.state.attemptId, { status: 'ready', assetDurationMs: 1500, audio: new Uint8Array([1]) }); });
    await action('play', { type: 'audioPhase', operationId: job.operationId, phase: 'playing' });
    const deadline = session.state.audioOperations[0]!.phaseDeadlineMs;
    await action('repeat-play', { type: 'audioPhase', operationId: job.operationId, phase: 'playing' });
    expect(session.state.audioOperations[0]!.phaseDeadlineMs).toBe(deadline);
    await action('overlap', { type: 'audioPhase', operationId: 'new-recording', phase: 'recording' }, 422);
    await action('idle', { type: 'audioPhase', operationId: job.operationId, phase: 'idle' });
    await action('replay-ended', { type: 'audioPhase', operationId: job.operationId, phase: 'playing' }, 422);
    const edited = await request(game.app).post(`${path}/turns`).send({ turnId: 'edited-turn', expectedVersion: session.state.version, npcId: 'xiaolin', input: { text: '我要水。', source: 'stt', transcriptionId: 'transcription-1' } }).expect(200);
    expect(edited.body.state.status).toBe('active');
    expect(session.state.evidence.find((entry) => entry.turnId === 'edited-turn')?.conversationSource).toBe('edited');
    expect(session.transcriptions.get('transcription-1')?.editedText).toBe('我要水。');
    await action('retry-audio', { type: 'retryMission' });
    await action('old-callback', { type: 'audioPhase', operationId: job.operationId, phase: 'playing' }, 422);
    await action('old-recording-callback', { type: 'audioPhase', operationId: job.operationId, phase: 'recording' }, 422);
    expect(session.transcriptions.size).toBe(0); expect(session.speechJobs.size).toBe(0);
  });
});
