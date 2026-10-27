import { createGame } from '@vibequest/shared';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { attachLiveRelay, type LiveConnect } from '../src/live/relay.js';
import { ANCHORS, fakeServices } from './game/helpers.js';

it('uses the server-owned English language for the live conversation instructions', async () => {
  const services = fakeServices({ NODE_ENV: 'test', GEMINI_API_KEY: 'fixture-key' });
  await services.sessionStore.create(createGame({ language: 'en', sessionId: 'english-live', worldId: 'w-test', attemptId: 'a1', missionId: 'Q1', initialTier: 0, validationMode: false, inputPreference: 'voice', providerStatus: 'live', spawn: { x: 0, z: 0 } }, Date.now()));
  let instructions = '';
  const connect: LiveConnect = async (params) => {
    instructions = String(params.config?.systemInstruction);
    return { sendRealtimeInput: () => undefined, sendClientContent: () => undefined, close: () => undefined };
  };
  const server = createServer();
  attachLiveRelay(server, services, { connect });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/sessions/english-live/live?npcId=vendor&anchorId=${ANCHORS.vendor.id}&language=zh`);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.on('error', reject);
      ws.on('message', (data) => { const message = JSON.parse(data.toString()); if (message.type === 'ready') resolve(); if (message.type === 'error') reject(new Error(message.code)); });
    });
    expect(instructions).toContain('Speak only English');
    expect(instructions).not.toContain('no English');
    expect(instructions).not.toContain('Speak only Simplified Chinese');
    expect(instructions).toContain('Only tea and water can be sold now');
  } finally {
    ws.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
