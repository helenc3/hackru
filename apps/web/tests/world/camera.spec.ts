import { expect, test } from '@playwright/test';
import { angularDisplacement, pointerAngle } from '../../src/world/camera';

const bounds = { left: 20, top: 40, width: 400, height: 200 };

test('camera turns with pointer angle, independent of radial distance', () => {
  const start = pointerAngle(320, 140, bounds)!;
  expect(angularDisplacement(start, pointerAngle(420, 140, bounds)!)).toBe(0);
  expect(angularDisplacement(start, pointerAngle(220, 240, bounds)!)).toBeCloseTo(Math.PI / 2);
});

test('crossing the angle boundary produces a small continuous turn', () => {
  expect(angularDisplacement(Math.PI - .1, -Math.PI + .1)).toBeCloseTo(.2);
  expect(angularDisplacement(-Math.PI + .1, Math.PI - .1)).toBeCloseTo(-.2);
});

test('pointer at the canvas center has no angle', () => {
  expect(pointerAngle(220, 140, bounds)).toBeNull();
});
