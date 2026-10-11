import { createGame } from '@vibequest/shared';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.js';
import { attachLiveRelay, type LiveConnect, type LiveSession } from '../src/live/relay.js';
import { createServices } from '../src/services.js';

type Fake = LiveSession & { closed: boolean; audio: string[]; signal?: AbortSignal };
const fakes: Fake[] = [];
let release: (() => void) | null = null; // when set, the next connect waits for it
const connect: LiveConnect = async (params) => {
  const fake: Fake = { closed: false, audio: [], signal: params.config?.abortSignal, sendRealtimeInput: (input) => { fake.audio.push(input.audio?.data ?? ''); }, sendClientContent: () => undefined, close: () => { fake.closed = true; } };
  fakes.push(fake);
  if (release) await new Promise<void>((resolve) => { release = resolve; });
  return fake;
};

const services = createServices(loadConfig({ NODE_ENV: 'test', GEMINI_API_KEY: 'test-key' }));
let server: Server; let port = 0; let sessionId = '';

const open = (id: string) => new Promise<{ ws: WebSocket; events: { type: string }[] }>((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/sessions/${id}/live?npcId=xiaolin`);
  const events: { type: string }[] = [];
  ws.on('message', (data) => { const event = JSON.parse(data.toString()); events.push(event); if (event.type === 'ready') resolve({ ws, events }); if (event.type === 'error') reject(new Error(event.code)); });
  ws.on('error', reject);
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeAll(async () => {
  const state = createGame({ sessionId: 'live-test', attemptId: 'a1', missionId: 'P1', initialTier: 0, validationMode: true, inputPreference: 'voice', providerStatus: 'live' }, Date.now());
  state.zoneId = 'cafe'; // validation mode skips the distance check; the zone must still match Xiaolin's
  sessionId = (await services.sessionStore.create(state)).id;
  server = createServer();
  attachLiveRelay(server, services, { connect });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('live relay lifecycle', () => {
  it('a second connection for the same game session replaces the first Gemini session, and the first socket closing leaves the second intact', async () => {
    const first = await open(sessionId);
    const second = await open(sessionId);
    await tick();
    expect(fakes).toHaveLength(2);
    expect(fakes[0]!.closed).toBe(true);
    expect(fakes[1]!.closed).toBe(false);
    expect(first.events.at(-1)).toEqual({ type: 'closed', reason: 'replaced' });
    first.ws.close();
    await tick();
    expect(fakes[1]!.closed).toBe(false);
    second.ws.send(Buffer.from([7, 7]));
    await tick();
    expect(fakes[1]!.audio).toEqual([Buffer.from([7, 7]).toString('base64')]);
    second.ws.close();
    await tick();
    expect(fakes[1]!.closed).toBe(true);
  });

  it('closing before ready aborts the pending connect and closes a late-arriving Gemini session', async () => {
    release = () => undefined; // arm: next connect blocks until released
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/sessions/${sessionId}/live?npcId=xiaolin`);
    await new Promise<void>((resolve) => ws.once('open', resolve));
    await tick();
    expect(fakes).toHaveLength(3);
    const pending = fakes[2]!;
    ws.close();
    await tick();
    expect(pending.signal?.aborted).toBe(true);
    release!(); release = null;
    await tick();
    expect(pending.closed).toBe(true);
  });

  it('rejects unknown sessions without opening Gemini', async () => {
    await expect(open('nope')).rejects.toThrow('SESSION_NOT_FOUND');
    expect(fakes).toHaveLength(3);
  });
});
