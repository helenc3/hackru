import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MAX_TRANSCRIPTION_REQUEST_BYTES } from '../src/routes/audio.js';
import { createServices } from '../src/services.js';
import { ANCHORS, fakeServices } from './game/helpers.js';

const developmentConfig = () =>
  loadConfig({ NODE_ENV: 'test', ENABLE_DEMO_FIXTURES: 'true', ENABLE_VALIDATION_HARNESS: 'true' });
const sessionRequest = { initialTier: 0, providerMode: 'fixture' };
const actionRequest = {
  actionId: 'bootstrap-action',
  expectedVersion: 0,
  action: { type: 'setInputPreference', preference: 'typed-accessibility' },
};
const turnRequest = {
  turnId: 'bootstrap-turn',
  expectedVersion: 0,
  npcId: 'vendor',
  anchorId: 'an.vendor.spawn',
  input: { text: '你好，我想要一杯茶。', source: 'typed' },
};

describe('bootstrap API boundary', () => {
  it('reports the exact health contract without exposing server secrets', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      GEMINI_API_KEY: 'test-gemini-secret',
      ELEVENLABS_API_KEY: 'test-elevenlabs-secret',
      ENABLE_DEMO_FIXTURES: 'true',
      ENABLE_VALIDATION_HARNESS: 'true',
    });
    const response = await request(createApp({ config })).get('/api/health').expect(200);
    expect(response.body).toEqual({
      status: 'ok',
      buildId: 'segment-007',
      specVersion: '1.2',
      providers: { geminiConfigured: true, elevenlabsConfigured: true },
      features: { validationHarness: true, fixtures: true, cityProvider: 'fallback' },
      segments: { engine: 'implemented', dialogue: 'live', speech: 'live' },
    });
    expect(response.text).not.toContain('test-gemini-secret');
    expect(response.text).not.toContain('test-elevenlabs-secret');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('reports missing provider configuration truthfully', async () => {
    const response = await request(createApp({ config: loadConfig({ NODE_ENV: 'test' }) }))
      .get('/api/health')
      .expect(200);
    expect(response.body.providers).toEqual({ geminiConfigured: false, elevenlabsConfigured: false });
    expect(response.body.features).toEqual({ validationHarness: false, fixtures: false, cityProvider: 'fallback' });
  });

  it('creates sessions in a world and returns honest errors for unknown session IDs', async () => {
    const app = createApp({ services: fakeServices() });
    const created = await request(app).post('/api/sessions').send({ ...sessionRequest, worldId: 'w-chosen' }).expect(201);
    expect(created.body.state).toMatchObject({ missionId: 'Q1', worldId: 'w-chosen', status: 'active', xp: 0, version: 0, position: { x: 0, z: 0 } });
    expect(created.body.state.interactables.map((target: { id: string }) => target.id)).toContain(ANCHORS.vendor.id);
    await request(app).get(`/api/sessions/${created.body.state.sessionId}`).expect(200);
    for (const response of await Promise.all([
      request(app).get('/api/sessions/bootstrap-session'),
      request(app).post('/api/sessions/bootstrap-session/actions').send(actionRequest),
      request(app).post('/api/sessions/bootstrap-session/turns').send(turnRequest),
    ])) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('SESSION_NOT_FOUND');
    }
  });

  it('rejects malformed shapes before reaching the game scaffold', async () => {
    const app = createApp({ config: developmentConfig() });
    const responses = await Promise.all([
      request(app).post('/api/sessions').send({ initialTier: 2, providerMode: 'fixture' }),
      request(app).post('/api/sessions/bootstrap-session/actions').send({ ...actionRequest, expectedVersion: -1 }),
      request(app).post('/api/sessions/bootstrap-session/turns').send({ ...turnRequest, input: { text: '', source: 'typed' } }),
      request(app).post('/api/sessions').type('json').send('{'),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({ code: 'INVALID_REQUEST', retryable: false });
    }
  });

  it('rejects fixture sessions unless explicitly enabled', async () => {
    const app = createApp({ config: loadConfig({ NODE_ENV: 'test' }) });
    const response = await request(app).post('/api/sessions').send(sessionRequest).expect(422);
    expect(response.body.error.code).toBe('FIXTURES_DISABLED');
  });

  it('rejects validation sessions unless the development harness is enabled', async () => {
    const app = createApp({ config: loadConfig({ NODE_ENV: 'test', ENABLE_DEMO_FIXTURES: 'true' }) });
    const response = await request(app)
      .post('/api/sessions')
      .send({ ...sessionRequest, validationMode: true })
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_DISABLED');
  });

  it('accepts a bounded multipart request but never fabricates a transcript', async () => {
    const app = createApp({ config: developmentConfig() });
    const response = await request(app)
      .post('/api/sessions/bootstrap-session/transcriptions')
      .set('Content-Type', 'multipart/form-data; boundary=bootstrap')
      .send('--bootstrap--\r\n')
      .expect(400);
    expect(response.body.error).toMatchObject({ code: 'INVALID_REQUEST', retryable: false });
    expect(response.body.text).toBeUndefined();
    expect(response.body.transcriptionId).toBeUndefined();
    await request(app).get('/api/sessions/bootstrap-session/speech/bootstrap-speech').expect(404);
  });

  it('rejects non-multipart audio and oversized upload requests', async () => {
    const app = createApp({ config: developmentConfig() });
    const malformed = await request(app)
      .post('/api/sessions/bootstrap-session/transcriptions')
      .send({ audio: 'not-a-recording' })
      .expect(400);
    expect(malformed.body.error.code).toBe('INVALID_REQUEST');
    const oversized = await request(app)
      .post('/api/sessions/bootstrap-session/transcriptions')
      .set('Content-Type', 'multipart/form-data; boundary=bootstrap')
      .send(Buffer.alloc(MAX_TRANSCRIPTION_REQUEST_BYTES + 1))
      .expect(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('single-origin production serving', () => {
  let fixtureRoot: string;
  let publicDirectory: string;
  const productionConfig = () => loadConfig({
    NODE_ENV: 'production',
    ENABLE_DEMO_FIXTURES: 'true',
    ENABLE_VALIDATION_HARNESS: 'true',
  });

  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), 'vibequest-server-'));
    // Codex checkouts can live under .codex; sendFile must not treat their
    // filesystem ancestors as requested dotfiles.
    publicDirectory = join(fixtureRoot, '.checkout', 'web', 'dist');
    await mkdir(join(publicDirectory, 'assets'), { recursive: true });
    await writeFile(join(publicDirectory, 'index.html'), '<!doctype html><title>VibeQuest 世界</title>');
    await writeFile(join(publicDirectory, 'assets', 'shell.js'), 'console.info("shell fixture");');
  });

  afterAll(async () => {
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('serves the shell, assets, and SPA paths from a checkout with hidden ancestors', async () => {
    const app = createApp({ config: productionConfig(), publicDirectory });
    for (const path of ['/', '/world', '/world/cafe']) {
      const response = await request(app).get(path).expect(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('VibeQuest 世界');
    }
    const asset = await request(app).get('/assets/shell.js').expect(200);
    expect(asset.text).toBe('console.info("shell fixture");');
  });

  it('keeps unknown API routes JSON rather than returning the SPA', async () => {
    const app = createApp({ config: productionConfig(), publicDirectory });
    for (const path of ['/api', '/api/unknown', '/api/sessions/session/unknown']) {
      const response = await request(app).get(path).expect(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.text).not.toContain('<!doctype');
    }
  });

  it('cannot enable validation in production, even with a true flag or injected development services', async () => {
    const app = createApp({
      config: productionConfig(),
      services: createServices(developmentConfig()),
      publicDirectory,
    });
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.features.validationHarness).toBe(false);
    const response = await request(app)
      .post('/api/sessions')
      .send({ ...sessionRequest, validationMode: true })
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_DISABLED');
    for (const path of ['/__validation', '/__validation/', '/validation', '/validation/hidden']) {
      const blocked = await request(app).get(path).expect(422);
      expect(blocked.body.error.code).toBe('VALIDATION_DISABLED');
    }
  });
});
