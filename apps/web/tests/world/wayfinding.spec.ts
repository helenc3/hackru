import { expect, test } from '@playwright/test';
import { chunkKey, createWorldView, generateFallbackChunk, questTarget, seedFromWorldId, type ChunkManifest, type MissionId, type Position } from '@vibequest/shared';
import { distance, movePlayer, nextLeg } from '../../src/world/navigation';

const weights = { 'drink-vendor': 1, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 };

/** A seeded city from x chunk −1..5 and z −2..2: spawn, 小李's avenue and the Huangpu west bank. */
function city(worldId: string) {
  const seed = seedFromWorldId(worldId);
  const manifests = new Map<string, ChunkManifest>();
  for (let cx = -1; cx <= 5; cx++) for (let cz = -2; cz <= 2; cz++) manifests.set(chunkKey({ cx, cz }), generateFallbackChunk(worldId, seed, { cx, cz }, { missionId: 'Q1', weights }));
  return { seed, manifests, view: createWorldView(worldId, seed, manifests) };
}

/** Follows legs exactly as Motion does: re-plan when a leg ends, step waypoints with the shared movement rule. */
function walk(world: ReturnType<typeof city>, start: Position, goal: Position) {
  let position = start;
  for (let legs = 0; legs < 60 && distance(position, goal) >= 1; legs++) {
    const leg = nextLeg(world.view, world.seed, world.manifests, position, goal);
    if (!leg.length) break;
    for (const waypoint of leg) {
      for (let i = 0; i < 400 && distance(position, waypoint) >= .01; i++) {
        const before = position;
        position = movePlayer(world.view, position, waypoint.x - position.x, position.z - waypoint.z, 0, Math.min(.05, distance(position, waypoint) / 4));
        if (distance(before, position) < .0001) break;
      }
    }
  }
  return position;
}

for (const worldId of ['wayfinding-a', 'wayfinding-b', 'wayfinding-c', 'wayfinding-d']) {
  test(`${worldId}: every quest target is named, reachable from spawn by Walk there`, () => {
    const world = city(worldId);
    const spawn = { x: 0, z: 0 };
    const target = (missionId: MissionId) => questTarget({ missionId, status: 'active', worldId, position: spawn, photo: null }, world.view)!;
    expect(target('Q1').label).toBe('老王');
    expect(target('Q2').label).toBe('小李');
    const river = target('Q3');
    expect(river.label).toContain('黄浦江');
    expect(river.position.x).toBeGreaterThan(130); // the west-bank promenade, ~140 m east of spawn
    expect(world.view.anchor(river.anchorId!)?.role).toBe('passerby');
    for (const goal of [target('Q1'), target('Q2'), river]) {
      expect(world.view.walkable(goal.position)).toBe(true);
      expect(distance(walk(world, spawn, goal.position), goal.position)).toBeLessThan(1);
    }
  });
}

test('quest targets stop once the attempt ends and follow the accepted photo spot', () => {
  const world = city('wayfinding-a');
  const base = { missionId: 'Q3' as const, worldId: 'wayfinding-a', position: { x: 0, z: 0 } };
  expect(questTarget({ ...base, status: 'cleared', photo: null }, world.view)).toBeNull();
  const spot = { x: 141, z: 30 };
  expect(questTarget({ ...base, status: 'active', photo: { id: 'p', passerbyAnchorId: 'a', viewpointAnchorId: 'v', spot, status: 'accepted', attempts: 0 } }, world.view)).toMatchObject({ label: '拍照点', position: spot });
});
