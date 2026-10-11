import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/city/catalog/index.js';
import { inSpawnBox, type QuestContextSnapshot } from '../../src/city/contracts.js';
import { generateFallbackChunk } from '../../src/city/fallback.js';
import { verifyManifestHash } from '../../src/city/hash.js';
import { planChunk, worldLayout } from '../../src/city/planner.js';
import { createRng, seedFromWorldId } from '../../src/city/rng.js';
import { validateManifest } from '../../src/city/validate.js';

const context = (boost = 1): QuestContextSnapshot => ({ missionId: 'Q1', weights: { 'drink-vendor': boost, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 } });
const worlds = ['w-alpha', 'w-beta', 'w-gamma', 'w-delta'];

describe('seeded fallback chunks', () => {
  it('validate for ~200 random chunks across seeds, including spawn, hotel and river chunks', () => {
    const failures: string[] = [];
    let count = 0;
    for (const worldId of worlds) {
      const seed = seedFromWorldId(worldId), rng = createRng(seed, 'test');
      const hotel = worldLayout(seed).hotel.coord;
      const coords = [hotel, { cx: 3, cz: 0 }, { cx: 4, cz: 0 }, ...worldLayout(seed).creekRows.map((cz) => ({ cx: 3, cz })), ...worldLayout(seed).creekRows.map((cz) => ({ cx: -1, cz }))];
      for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) coords.push({ cx, cz });
      while (coords.length < 50) coords.push({ cx: Math.floor(rng() * 24) - 12, cz: Math.floor(rng() * 24) - 12 });
      for (const coord of coords) {
        const plan = planChunk(seed, coord);
        const manifest = generateFallbackChunk(worldId, seed, coord, context(), plan);
        count++;
        const result = validateManifest(manifest, plan);
        if (!result.ok) failures.push(`${worldId} ${coord.cx},${coord.cz}: ${result.errors.slice(0, 3).join('; ')}`);
      }
    }
    expect(count).toBeGreaterThanOrEqual(200);
    expect(failures).toEqual([]);
  });

  it('is deterministic and sealed', () => {
    const seed = seedFromWorldId('w-alpha');
    const a = generateFallbackChunk('w-alpha', seed, { cx: 0, cz: 0 }, context());
    const b = generateFallbackChunk('w-alpha', seed, { cx: 0, cz: 0 }, context());
    expect(a).toEqual(b);
    expect(verifyManifestHash(a)).toBe(true);
    expect(a.source).toBe('fallback');
  });

  it('uses only approved catalog assets and places every required anchor', () => {
    const ids = new Set(CATALOG.filter((e) => e.review === 'approved').map((e) => e.id));
    for (const worldId of worlds) {
      const seed = seedFromWorldId(worldId);
      for (const coord of [{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, worldLayout(seed).hotel.coord, { cx: 3, cz: 0 }, { cx: 3, cz: 3 }]) {
        const plan = planChunk(seed, coord);
        const m = generateFallbackChunk(worldId, seed, coord, context(), plan);
        expect(m.placements.every((p) => ids.has(p.assetId))).toBe(true);
        for (const required of plan.requiredAnchors) expect(m.anchors.map((a) => a.id), `${worldId} ${coord.cx},${coord.cz}`).toContain(required.anchorId);
        if (inSpawnBox(coord) && coord.cx === 0 && coord.cz === 0) expect(m.anchors.find((a) => a.capability === 'drink-vendor')?.nameKey).toBe('laowang');
      }
    }
  });

  it('places the hotel only in its reserved chunk and keeps anchor IDs globally unique', () => {
    const seed = seedFromWorldId('w-beta');
    const seen = new Set<string>();
    for (let cx = -3; cx <= 4; cx++) for (let cz = -3; cz <= 3; cz++) {
      const m = generateFallbackChunk('w-beta', seed, { cx, cz }, context());
      const hotel = m.placements.some((p) => p.assetId === 'an.hotel.grand');
      expect(hotel).toBe(cx === worldLayout(seed).hotel.coord.cx && cz === worldLayout(seed).hotel.coord.cz);
      for (const a of m.anchors) { expect(seen.has(a.id), a.id).toBe(false); seen.add(a.id); }
    }
  });

  it('raises optional vendor frequency when the quest weight is boosted', () => {
    const seed = seedFromWorldId('w-gamma');
    const vendors = (boost: number) => {
      let n = 0;
      for (let cx = -10; cx <= 2; cx++) for (let cz = -8; cz <= 8; cz++) if (!inSpawnBox({ cx, cz })) n += generateFallbackChunk('w-gamma', seed, { cx, cz }, context(boost)).anchors.filter((a) => a.capability === 'drink-vendor').length;
      return n;
    };
    expect(vendors(1.5)).toBeGreaterThan(vendors(1));
  });
});
