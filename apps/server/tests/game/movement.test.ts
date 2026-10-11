import { expect, it } from 'vitest';
import request from 'supertest';
import { advance, campaign, WALL } from './helpers.js';

it('walks committed ground at the authored speed and rejects walls, uncommitted chunks and teleports', async () => {
  const game = await campaign();
  const path = `/api/sessions/${game.state.sessionId}`;
  advance(250);
  await game.act({ type: 'move', position: { x: 0, z: 1 } });
  advance(249);
  await request(game.app).get(path).expect(200); // a read must not reset the movement baseline
  advance(251);
  await game.act({ type: 'move', position: { x: 0, z: 2 } });
  advance(50);
  const fast = await game.act({ type: 'move', position: { x: 0, z: 6 } }, 422);
  expect(fast.body.error.message).toContain('speed');
  const session = await game.session();
  expect(session.state.position).toEqual({ x: 0, z: 2 });
  advance(10_000);
  await game.act({ type: 'move', position: { x: WALL.minX + 0.5, z: 0 } }, 422);
  await game.act({ type: 'move', position: { x: 0, z: 140 } }, 422); // inside WORLD_LIMIT but not committed
  const waterfront = await game.act({ type: 'move', position: { x: 12, z: 2 } });
  expect(waterfront.body.state).toMatchObject({ zoneId: 'waterfront', position: { x: 12, z: 2 } });
});
