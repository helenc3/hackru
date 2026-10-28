import { test, expect } from 'vitest';
import { Box3, Vector3 } from 'three';
import { fixtureChunk } from '../../../../fixtures/world/city';
import { buildingCameraVolumes, cameraDistance, DEFAULT_PITCH, PITCH_MAX, PITCH_MIN, dragOrbit, orbitDistance } from '../../src/world/camera';

test('horizontal drag turns, vertical drag tilts, and tilt stays within bounds', () => {
  expect(dragOrbit(0, DEFAULT_PITCH, 100, 0)).toEqual({ yaw: -.6, pitch: DEFAULT_PITCH });
  expect(dragOrbit(0, DEFAULT_PITCH, 0, 50).pitch).toBeCloseTo(DEFAULT_PITCH + .3);
  expect(dragOrbit(0, DEFAULT_PITCH, 0, 10_000).pitch).toBe(PITCH_MAX);
  expect(dragOrbit(0, DEFAULT_PITCH, 0, -10_000).pitch).toBe(PITCH_MIN);
});

test('looking up and down keeps a close shoulder distance', () => {
  expect(orbitDistance(PITCH_MIN)).toBe(3.8);
  expect(orbitDistance(PITCH_MAX)).toBe(3.8);
  expect(DEFAULT_PITCH).toBeLessThan(Math.PI / 12);
});

test('camera boom stops outside the nearest wall, including glancing corners', () => {
  const origin = new Vector3(0, 1.25, 0);
  const far = new Box3(new Vector3(-2, 0, 2), new Vector3(2, 8, 3));
  const near = new Box3(new Vector3(.2, 0, 1), new Vector3(2, 8, 1.5));
  const desired = new Vector3(.6, 1.8, 3);
  const allowed = cameraDistance(origin, desired, [[far], [near]]);
  const actual = desired.clone().sub(origin).setLength(allowed).add(origin);
  expect(actual.z).toBeLessThan(1);
  expect(near.containsPoint(actual)).toBe(false);
  expect(far.containsPoint(actual)).toBe(false);
});

test('camera can clear a low obstacle but never exits through a wall from inside', () => {
  const origin = new Vector3(0, 1.25, 0), desired = new Vector3(0, 1.8, 3);
  const low = new Box3(new Vector3(-1, 0, 1), new Vector3(1, .5, 2));
  expect(cameraDistance(origin, desired, [[low]])).toBeCloseTo(origin.distanceTo(desired));
  const enclosing = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 5, 1));
  expect(cameraDistance(origin, desired, [[enclosing]])).toBe(0);
});

test('camera volumes follow rotated buildings in streamed chunks and exclude scenery', () => {
  const manifest = fixtureChunk('camera-test', { cx: 1, cz: -1 });
  manifest.placements.push({ id: 'building', assetId: 'bld.warehouse.shed', params: { width: 8, depth: 6 }, x: 10, z: 20, rotation: 90 });
  const boxes = buildingCameraVolumes(manifest);
  expect(boxes).toHaveLength(1);
  expect(boxes[0]!.min.x).toBeCloseTo(46.78);
  expect(boxes[0]!.max.z).toBeCloseTo(-15.78);
  expect(boxes[0]!.max.y).toBeGreaterThan(4.5);
  expect(buildingCameraVolumes(manifest)).toBe(boxes);
});

test('camera clears a walkable archway and also treats the hotel landmark as a building', () => {
  const gate = fixtureChunk('camera-test', { cx: 0, cz: 0 });
  gate.placements.push({ id: 'gate', assetId: 'bld.lanehouse.gate', params: {}, x: 10, z: 10, rotation: 0 });
  const from = new Vector3(10, 1.25, 8), to = new Vector3(10, 1.8, 12);
  expect(cameraDistance(from, to, [buildingCameraVolumes(gate)])).toBeCloseTo(from.distanceTo(to));
  const hotel = fixtureChunk('camera-test', { cx: 0, cz: 0 });
  hotel.placements.push({ id: 'hotel', assetId: 'an.hotel.grand', params: {}, x: 20, z: 20, rotation: 0 });
  expect(buildingCameraVolumes(hotel)).toHaveLength(1);
});
