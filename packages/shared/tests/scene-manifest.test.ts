import { describe, expect, it } from 'vitest';
import { ChoiceIdSchema, CueIdSchema, NpcIdSchema, SceneManifestSchema, type Position, type SceneManifest } from '../src/contracts.js';
import { sceneManifest } from '../src/content/scene-manifest.js';

// Half-unit flood fill with the actual avatar radius. This is an authored-scene
// safety check, not a substitute for Segment-004's movement/collision tests.
function reachablePoints(scene: SceneManifest): Position[] {
  const step = 0.5;
  const radius = scene.playerRadius;
  const isWalkable = ({ x, z }: Position) => {
    if (x - radius < scene.bounds.minX || x + radius > scene.bounds.maxX || z - radius < scene.bounds.minZ || z + radius > scene.bounds.maxZ) return false;
    return scene.colliders.every(({ bounds }) => {
      const dx = x - Math.max(bounds.minX, Math.min(x, bounds.maxX));
      const dz = z - Math.max(bounds.minZ, Math.min(z, bounds.maxZ));
      return dx * dx + dz * dz > radius * radius;
    });
  };
  const result: Position[] = [];
  const visited = new Set<string>();
  const queue = [scene.spawn];
  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    if (!point) continue;
    const key = `${point.x},${point.z}`;
    if (visited.has(key) || !isWalkable(point)) continue;
    visited.add(key);
    result.push(point);
    queue.push({ x: point.x + step, z: point.z }, { x: point.x - step, z: point.z }, { x: point.x, z: point.z + step }, { x: point.x, z: point.z - step });
  }
  return result;
}

describe('frozen district geometry', () => {
  it('keeps all canonical targets in the shared manifest and their declared zone', () => {
    expect(SceneManifestSchema.parse(sceneManifest)).toEqual(sceneManifest);
    const targetIds = new Set(sceneManifest.interactables.map((target) => target.id));
    for (const id of [...ChoiceIdSchema.options, ...CueIdSchema.options, ...NpcIdSchema.options]) expect(targetIds.has(id), id).toBe(true);
    for (const target of sceneManifest.interactables) {
      const zone = sceneManifest.zones.find((item) => item.id === target.zoneId);
      expect(zone, target.id).toBeDefined();
      expect(target.position.x).toBeGreaterThanOrEqual(zone?.bounds.minX ?? Infinity);
      expect(target.position.x).toBeLessThanOrEqual(zone?.bounds.maxX ?? -Infinity);
      expect(target.position.z).toBeGreaterThanOrEqual(zone?.bounds.minZ ?? Infinity);
      expect(target.position.z).toBeLessThanOrEqual(zone?.bounds.maxZ ?? -Infinity);
    }
  });

  it('allows the avatar to reach every zone and interactable from plaza spawn', () => {
    const reachable = reachablePoints(sceneManifest);
    expect(reachable.length).toBeGreaterThan(5_000);
    for (const target of [...sceneManifest.zones.map((zone) => ({ id: zone.id, position: zone.center })), ...sceneManifest.interactables]) {
      expect(reachable.some((point) => Math.hypot(point.x - target.position.x, point.z - target.position.z) <= sceneManifest.interactionRadius), target.id).toBe(true);
    }
  });

  it('detects an accidental wall sealing the station route', () => {
    const sealed = { ...sceneManifest, colliders: [...sceneManifest.colliders, { id: 'bad-cross-district-wall', bounds: { minX: -20, maxX: 20, minZ: 1.5, maxZ: 2.5 } }] };
    const reachable = reachablePoints(sealed);
    expect(reachable.some((point) => Math.hypot(point.x, point.z + 12) <= sealed.interactionRadius)).toBe(false);
  });
});
