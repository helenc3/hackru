import { expect, test } from '@playwright/test';
import { createBaselineState, sceneManifest } from '@vibequest/shared';
import { collides, distance, movePlayer, nearbyTargets, targetAction, zoneAt } from '../../src/world/navigation';

test('movement preserves frozen speed, camera direction and circle clearance', () => {
  const spawn = sceneManifest.spawn;
  const straight = movePlayer(spawn, 0, 1, 0, .1);
  const diagonal = movePlayer(spawn, 1, 1, 0, .1);
  expect(distance(spawn, straight)).toBeCloseTo(.4);
  expect(distance(spawn, diagonal)).toBeCloseTo(.4);
  expect(movePlayer(spawn, 0, 1, Math.PI / 2, .1).x).toBeCloseTo(-.4);
  expect(movePlayer(spawn, 0, 1, 0, 10).z).toBeCloseTo(9.6);
  let position = { x: -13.8, z: 5 };
  for (let i = 0; i < 10; i++) position = movePlayer(position, -1, 1, 0, .05);
  expect(collides(position)).toBe(false);
  expect(position.x).toBeGreaterThanOrEqual(-14.15 - .001);
  expect(position.z).toBeLessThan(4); // slides along the west wall
  for (let i = 0; i < 300; i++) position = movePlayer(position, 1, -1, 0, .1);
  expect(position.x).toBeLessThanOrEqual(19.65);
  expect(position.z).toBeLessThanOrEqual(19.65);
  expect(collides(position)).toBe(false);
});

test('all frozen zones and interactables are reachable by collision-safe steps', () => {
  const start = sceneManifest.spawn;
  const queue = [start];
  const seen = new Set([`${start.x},${start.z}`]);
  for (let index = 0; index < queue.length; index++) {
    const p = queue[index];
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let next = p;
      for (let i = 0; i < 5; i++) next = movePlayer(next, dx, -dz, 0, .05);
      const grid = { x: Math.round(next.x), z: Math.round(next.z) };
      if (distance(next, grid) > .01 || collides(grid)) continue;
      const key = `${grid.x},${grid.z}`;
      if (!seen.has(key)) { seen.add(key); queue.push(grid); }
    }
  }
  for (const zone of sceneManifest.zones) expect(queue.some((p) => zoneAt(p) === zone.id), zone.id).toBe(true);
  for (const target of sceneManifest.interactables) expect(queue.some((p) => distance(p, target.position) <= 2), target.id).toBe(true);
});

test('nearby targets use exact shared action IDs and bounded range', () => {
  for (const missionId of ['P1', 'P2', 'B1'] as const) {
    const state = createBaselineState(missionId);
    for (const target of state.interactables) {
      expect(nearbyTargets(state, target.position).some((item) => item.id === target.id)).toBe(true);
      expect(nearbyTargets(state, { x: target.position.x, z: target.position.z + 2.001 }).some((item) => item.id === target.id)).toBe(false);
      const action = targetAction(target);
      if (target.kind === 'choice') expect(action).toEqual({ type: 'choose', choiceId: target.id });
      if (target.kind === 'sign') expect(action).toEqual({ type: 'inspect', targetId: target.id });
      if (target.kind === 'pa') expect(action).toEqual({ type: 'playCue', cueId: target.id, channel: 'audio' });
      if (target.kind === 'npc') expect(action).toBeNull();
    }
  }
});
