import { expect, test } from '../../../../tests/support/browser-test';
import { DEFAULT_PITCH, PITCH_MAX, PITCH_MIN, dragOrbit, orbitDistance } from '../../src/world/camera';

test('horizontal drag turns, vertical drag tilts, and tilt stays within bounds', () => {
  expect(dragOrbit(0, DEFAULT_PITCH, 100, 0)).toEqual({ yaw: -.6, pitch: DEFAULT_PITCH });
  expect(dragOrbit(0, DEFAULT_PITCH, 0, 50).pitch).toBeCloseTo(DEFAULT_PITCH + .3);
  expect(dragOrbit(0, DEFAULT_PITCH, 0, 10_000).pitch).toBe(PITCH_MAX);
  expect(dragOrbit(0, DEFAULT_PITCH, 0, -10_000).pitch).toBe(PITCH_MIN);
});

test('the camera moves closer as it tilts toward the ground', () => {
  expect(orbitDistance(PITCH_MIN)).toBe(6);
  expect(orbitDistance(PITCH_MAX)).toBe(15);
  expect(orbitDistance(DEFAULT_PITCH)).toBeLessThan(orbitDistance(PITCH_MAX));
  expect(orbitDistance(DEFAULT_PITCH)).toBeGreaterThan(orbitDistance(PITCH_MIN));
});
