import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { GameAction, PublicState, SpeechProvider } from '@vibequest/shared';
import { createApp } from '../../src/app.js';
import { ANCHORS, fakeServices } from '../game/helpers.js';
import { createFixtureSpeechProvider } from '../../src/providers/speech.js';
import { mp3DurationMs } from '../../src/providers/elevenlabs/live.js';
import { silentMp3Frame } from '../../src/providers/elevenlabs/fixture.js';
import { HttpError } from '../../src/errors.js';

type Speech = SpeechProvider & { calls: { synthesize: number; transcribe: number } };
function countingSpeech(base: SpeechProvider = createFixtureSpeechProvider()): Speech {
  const calls = { synthesize: 0, transcribe: 0 };
  return {
    calls,
    synthesize: (text, voice) => { calls.synthesize++; return base.synthesize(text, voice); },
    transcribe: (audio, mime) => { calls.transcribe++; return base.transcribe(audio, mime); },
  };
}

async function game(speech: SpeechProvider = countingSpeech()) {
  const services = fakeServices();
  services.speechProvider = speech;
  const app = createApp({ services });
  let state: PublicState = (await request(app).post('/api/sessions').send({ initialTier: 1, providerMode: 'fixture', validationMode: true }).expect(201)).body.state;
  let n = 0;
  const act = async (action: GameAction, status = 200) => {
    const response = await request(app).post(`/api/sessions/${state.sessionId}/actions`).send({ actionId: `a-${++n}`, expectedVersion: state.version, action }).expect(status);
    if (response.body.state) state = response.body.state;
    return response;
  };
  const turn = async (input: { text: string; source: 'typed' | 'stt' | 'stt-edited'; transcriptionId?: string }, status = 200) => {
    const response = await request(app).post(`/api/sessions/${state.sessionId}/turns`).send({ turnId: `t-${++n}`, expectedVersion: state.version, npcId: 'vendor', anchorId: ANCHORS.vendor.id, input }).expect(status);
    if (response.body.state) state = response.body.state;
    return response;
  };
  const upload = (operationId: string | undefined, clip = Buffer.from(silentMp3Frame()), type = 'audio/webm') => {
    const post = request(app).post(`/api/sessions/${state.sessionId}/transcriptions`).attach('audio', clip, { filename: 'clip.webm', contentType: type });
    return operationId ? post.field('operationId', operationId) : post;
  };
  /** Records a clip through the bounded lifecycle and returns the server-issued transcription. */
  const record = async (operationId: string, status = 200) => {
    await act({ type: 'audioPhase', operationId, phase: 'recording' });
    await act({ type: 'audioPhase', operationId, phase: 'transcribing' });
    const response = await upload(operationId).expect(status);
    if (status === 200) await act({ type: 'audioPhase', operationId, phase: 'confirming' });
    await act({ type: 'audioPhase', operationId, phase: 'idle' });
    return response.body as { text: string; transcriptionId: string };
  };
  const session = async () => (await services.sessionStore.get(state.sessionId))!;
  // The spawn vendor is already within interaction reach.
  const atCafe = async () => undefined;
  const speechGet = (speechId: string) => request(app).get(`/api/sessions/${state.sessionId}/speech/${speechId}`);
  const until200 = async (speechId: string) => {
    for (let i = 0; i < 50; i++) {
      const response = await speechGet(speechId);
      if (response.status !== 202) return response;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('speech never resolved');
  };
  return { app, services, act, turn, upload, record, session, atCafe, speechGet, until200, get state() { return state; } };
}

const conversationSources = async (g: Awaited<ReturnType<typeof game>>) =>
  (await g.session()).state.evidence.filter((entry) => entry.track === 'conversation').map((entry) => entry.conversationSource);

describe('Segment-005 transcription', () => {
  it('returns a session-bound transcript without creating a turn; only Send advances', async () => {
    const g = await game();
    await g.atCafe();
    const before = g.state.version;
    const heard = await g.record('rec-1');
    expect(heard).toEqual({ text: '请给我一杯茶。', transcriptionId: expect.any(String) });
    expect((await g.session()).state.evidence.filter((entry) => entry.track === 'conversation')).toHaveLength(0);
    expect(g.state.version).toBeGreaterThan(before); // lifecycle actions only
    await g.turn({ text: heard.text, source: 'stt', transcriptionId: heard.transcriptionId });
    expect(await conversationSources(g)).toEqual(['spoken']);
  });

  it('labels edited transcripts as edited even when the client claims stt', async () => {
    const g = await game();
    await g.atCafe();
    const heard = await g.record('rec-1');
    await g.turn({ text: '我要茶。', source: 'stt', transcriptionId: heard.transcriptionId });
    expect(await conversationSources(g)).toEqual(['edited']);
  });

  it('rejects forged, unrelated and expired transcription IDs', async () => {
    const g = await game();
    await g.atCafe();
    expect((await g.turn({ text: '请给我一杯茶。', source: 'stt', transcriptionId: 'forged-id' }, 422)).body.error.code).toBe('INVALID_PROVENANCE');
    const other = await game();
    await other.atCafe();
    const foreign = await other.record('rec-x');
    expect((await g.turn({ text: foreign.text, source: 'stt', transcriptionId: foreign.transcriptionId }, 422)).body.error.code).toBe('INVALID_PROVENANCE');
    const heard = await g.record('rec-1');
    (await g.session()).transcriptions.get(heard.transcriptionId)!.expiresAtMs = Date.now() - 1;
    expect((await g.turn({ text: heard.text, source: 'stt', transcriptionId: heard.transcriptionId }, 422)).body.error.code).toBe('INVALID_PROVENANCE');
  });

  it('requires the active recording operation and validates clips', async () => {
    const g = await game();
    expect((await g.upload(undefined).expect(400)).body.error.code).toBe('INVALID_REQUEST');
    expect((await g.upload('not-recording').expect(422)).body.error.code).toBe('NO_ACTIVE_RECORDING');
    await g.act({ type: 'audioPhase', operationId: 'rec-1', phase: 'recording' });
    expect((await g.upload('rec-1', Buffer.from('x'), 'text/plain').expect(415)).body.error.code).toBe('UNSUPPORTED_AUDIO');
    expect((await g.upload('rec-1', Buffer.alloc(0)).expect(413)).body.error.code).toBe('CLIP_TOO_LARGE');
  });

  it('offers re-record on an empty transcript and 503 on provider failure without changing state', async () => {
    const empty = await game(createFixtureSpeechProvider('   '));
    await empty.act({ type: 'audioPhase', operationId: 'rec-1', phase: 'recording' });
    expect((await empty.upload('rec-1').expect(422)).body.error).toMatchObject({ code: 'EMPTY_TRANSCRIPT', retryable: true });
    const failing: SpeechProvider = { synthesize: () => Promise.reject(new Error('x')), transcribe: () => Promise.reject(new HttpError(503, 'TRANSCRIPTION_UNAVAILABLE', 'down', true)) };
    const g = await game(failing);
    await g.act({ type: 'audioPhase', operationId: 'rec-1', phase: 'recording' });
    const before = (await g.session()).state;
    expect((await g.upload('rec-1').expect(503)).body.error).toMatchObject({ code: 'TRANSCRIPTION_UNAVAILABLE', retryable: true });
    expect((await g.session()).state).toEqual(before);
    expect((await g.session()).transcriptions.size).toBe(0);
  });

  it('discards a transcript that finishes after mission retry', async () => {
    let release!: (text: string) => void;
    const slow: SpeechProvider = { synthesize: async () => silentMp3Frame(), transcribe: () => new Promise((resolve) => { release = resolve; }) };
    const g = await game(slow);
    await g.act({ type: 'audioPhase', operationId: 'rec-1', phase: 'recording' });
    const pending = g.upload('rec-1').then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await g.act({ type: 'retryMission' });
    release('请给我一杯茶。');
    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ATTEMPT_ABANDONED');
    expect((await g.session()).transcriptions.size).toBe(0);
  });
});

describe('Segment-005 speech jobs', () => {
  it('synthesizes one job per committed reply: 202 then 200 with duration, no second synth', async () => {
    const speech = countingSpeech();
    const g = await game(speech);
    await g.atCafe();
    const reply = (await g.turn({ text: '请给我一杯茶。', source: 'typed' })).body;
    expect(reply.speechId).toEqual(expect.any(String));
    expect((await g.session()).speechJobs.size).toBe(1);
    const first = await g.speechGet(reply.speechId).expect(202);
    expect(first.headers['retry-after']).toBe('1');
    const ready = await g.until200(reply.speechId);
    expect(ready.status).toBe(200);
    expect(ready.headers['content-type']).toMatch(/audio\/mpeg/);
    expect(Number(ready.headers['x-asset-duration-ms'])).toBe(mp3DurationMs(silentMp3Frame()));
    await g.speechGet(reply.speechId).expect(200);
    expect(speech.calls.synthesize).toBe(1);
    expect((await g.session()).speechJobs.size).toBe(1);
  });

  it('returns 410 for failed synthesis and keeps committed gameplay', async () => {
    const g = await game({ synthesize: () => Promise.reject(new Error('tts down')), transcribe: async () => '你好' });
    await g.atCafe();
    const reply = (await g.turn({ text: '请给我一杯茶。', source: 'typed' })).body;
    const version = g.state.version;
    const final = await g.until200(reply.speechId);
    expect(final.status).toBe(410);
    expect(final.body.error.code).toBe('SPEECH_FAILED');
    expect((await g.session()).state.version).toBe(version);
  });

  it('rejects unknown, foreign and retried-attempt speech IDs', async () => {
    let release!: (audio: Uint8Array) => void;
    const g = await game({ synthesize: () => new Promise((resolve) => { release = resolve; }), transcribe: async () => '你好' });
    await g.atCafe();
    await g.speechGet('unknown').expect(404);
    const reply = (await g.turn({ text: '请给我一杯茶。', source: 'typed' })).body;
    const other = await game();
    await request(other.app).get(`/api/sessions/${other.state.sessionId}/speech/${reply.speechId}`).expect(404);
    await g.speechGet(reply.speechId).expect(202);
    await g.act({ type: 'retryMission' });
    release(silentMp3Frame()); // late audio must not attach to the new attempt
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await g.speechGet(reply.speechId).expect(410)).body.error.code).toBe('SPEECH_INVALIDATED');
    expect((await g.session()).speechJobs.size).toBe(0);
  });
});

describe('retired PA playback', () => {
  it('no longer exposes the station cue-playback route', async () => {
    const g = await game();
    await request(g.app).get(`/api/sessions/${g.state.sessionId}/cue-playback`).expect(404);
  });
});
