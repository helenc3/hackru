import { expect, it } from 'vitest';
import { WORLD_RULES } from '@vibequest/shared';
import { movementWaitMs } from '../../src/world/movement-sync';

it('does not delay the first sample, unchanged position, or a sample within the elapsed walking budget', () => {
  const origin = { x: 0, z: 0 };
  expect(movementWaitMs(null, origin, undefined, 0)).toBe(0);
  expect(movementWaitMs(origin, origin, 1_000, 1_000)).toBe(0);
  expect(movementWaitMs(origin, { x: 4, z: 0 }, 1_000, 2_000)).toBe(0);
});

it('paces bunched requests within the unchanged server speed rule at normal and accelerated fixture speeds', () => {
  const from = { x: 0, z: 0 }, to = { x: 9, z: 4 };
  for (const multiplier of [1, 4, 8]) {
    const acknowledgedAt = 1_000, now = 1_100;
    const wait = movementWaitMs(from, to, acknowledgedAt, now, multiplier);
    expect(wait).toBeGreaterThan(0);
    const elapsedAtArrival = now + wait - acknowledgedAt;
    const serverLimit = WORLD_RULES.movementSpeed * multiplier * elapsedAtArrival / 1_000 + 1;
    expect(Math.hypot(to.x, to.z)).toBeLessThan(serverLimit);
  }
});

it('does not spend negative elapsed time when a clock boundary is ahead of now', () => {
  expect(movementWaitMs({ x: 0, z: 0 }, { x: 4.5, z: 0 }, 1_001, 1_000)).toBe(1_000);
});
