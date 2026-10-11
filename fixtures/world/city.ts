import { QuestCategorySchema, sealManifest, type ChunkCoord, type ChunkManifest, type QuestCategory } from '@vibequest/shared';

/** Deterministic 3 × 3 park for world tests: open ground, plus a creek (x 24–28 in chunk 0,0) crossed by a level bridge at z 18–22. */
export const FIXTURE_WORLD = 'fixture-world';
const weights = Object.fromEntries(QuestCategorySchema.options.map((category) => [category, 1])) as Record<QuestCategory, number>;
export function fixtureChunk(worldId: string, coord: ChunkCoord): ChunkManifest {
  const { cx, cz } = coord;
  const creek = cx === 0 && cz === 0;
  return sealManifest({
    worldId, coord: { cx, cz }, district: 'park', catalogVersion: 'fixture', generatorVersion: 1, seed: 'fixture', source: 'fixture',
    questContext: { missionId: 'Q1', weights }, connectors: [], roads: [],
    water: creek ? [{ id: 'creek', kind: 'creek', rect: { minX: 24, maxX: 28, minZ: 0, maxZ: 40 } }] : [],
    bridges: creek ? [{ id: 'bridge', assetId: 'wf.bridge.level', rect: { minX: 23, maxX: 29, minZ: 18, maxZ: 22 }, axis: 'x' }] : [],
    placements: [], anchors: [], missingCapabilities: [],
  });
}
export function fixtureCity(worldId = FIXTURE_WORLD): ChunkManifest[] {
  const out: ChunkManifest[] = [];
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) out.push(fixtureChunk(worldId, { cx, cz }));
  return out;
}
