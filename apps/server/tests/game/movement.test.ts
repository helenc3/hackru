import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { fixtureApp } from './helpers.js';

it('allows walking after timer synchronization and reads while rejecting excess speed', async () => {
  let now = 1000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const { app, services } = fixtureApp();
    const created = await request(app).post('/api/sessions').send({ initialTier: 1, providerMode: 'fixture', validationMode: false }).expect(201);
    const path = `/api/sessions/${created.body.state.sessionId}`;
    let version = created.body.state.version;
    let actionId = 0;
    const move = async (z: number, status = 200) => {
      const response = await request(app).post(`${path}/actions`).send({ actionId: `move-${++actionId}`, expectedVersion: version, action: { type: 'moveZone', zoneId: 'plaza', position: { x: 0, z } } }).expect(status);
      version = response.body.state.version;
      return response;
    };
    now = 1250;
    await move(9); // 4 units/second, beyond the 0.25-unit tolerance.
    now = 1499;
    await request(app).get(path).expect(200);
    now = 1500;
    await move(8); // A read must not reset the movement baseline.
    now = 1550;
    const rejected = await move(6, 422);
    expect(rejected.body.error.message).toContain('speed');
    const session = (await services.sessionStore.get(created.body.state.sessionId))!;
    expect(session.state.position).toEqual({ x: 0, z: 8 });
    expect(session.state.lastMovementAtMs).toBe(1500);
    now = 1750;
    await move(7); // Rejection/error recovery must preserve elapsed movement time.
    now = 2000;
    await request(app).post(`${path}/actions`).send({ actionId: 'retry', expectedVersion: version, action: { type: 'retryMission' } }).expect(200);
    expect(session.state.lastMovementAtMs).toBe(2000);
  } finally {
    clock.mockRestore();
  }
});
