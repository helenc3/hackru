import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, DISTRICT_TARGETS, chunkKey, inSpawnBox, type Connector, type Edge } from '../../src/city/contracts.js';
import { districtOf, planChunk, worldLayout } from '../../src/city/planner.js';
import { createRng, hashString, seedFromWorldId } from '../../src/city/rng.js';

const SEEDS = ['a1b2c3d4e5f60718', seedFromWorldId('w-test'), seedFromWorldId('w-other'), '0000000000000000'];
const opposite: Record<Edge, Edge> = { north: 'south', south: 'north', west: 'east', east: 'west' };
const step: Record<Edge, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const norm = (list: Connector[]) => list.map((c) => `${c.kind}@${c.offset}/${c.width}`).sort();

describe('rng', () => {
  it('is deterministic and salted', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(seedFromWorldId('w1')).toBe(seedFromWorldId('w1'));
    expect(seedFromWorldId('w1')).not.toBe(seedFromWorldId('w2'));
    const a = createRng('s', 1, 2), b = createRng('s', 1, 2), c = createRng('s', 2, 1);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('regional planner', () => {
  it('derives identical connectors on both sides of every shared edge, regardless of order', () => {
    for (const seed of SEEDS) for (let cx = -6; cx <= 7; cx++) for (let cz = -6; cz <= 6; cz++) {
      const plan = planChunk(seed, { cx, cz });
      for (const edge of ['north', 'east', 'south', 'west'] as const) {
        const [dx, dz] = step[edge];
        const other = planChunk(seed, { cx: cx + dx, cz: cz + dz });
        expect(norm(plan.connectors.filter((c) => c.edge === edge)), `${seed} ${cx},${cz} ${edge}`).toEqual(norm(other.connectors.filter((c) => c.edge === opposite[edge])));
      }
    }
  });

  it('widens streets and avenues by 1.3× while keeping shared connectors consistent', () => {
    const roads = Array.from({ length: 9 }, (_, i) => planChunk(SEEDS[0]!, { cx: i - 4, cz: -1 }).roads).flat();
    expect(roads.filter((r) => r.kind === 'street').every((r) => r.width === 4.55)).toBe(true);
    expect(roads.filter((r) => r.kind === 'avenue').every((r) => r.width === 6.5)).toBe(true);
    const banks = Array.from({ length: 9 }, (_, i) => planChunk(SEEDS[0]!, { cx: i - 2, cz: 0 })).flatMap((p) => p.roads).filter((r) => r.kind === 'promenade');
    expect(banks.length).toBeGreaterThan(0);
    expect(banks.every((r) => r.width === 3.9)).toBe(true);
  });

  it('ends seam-crossing roads exactly on the edge at the connector offset', () => {
    for (const seed of SEEDS) for (let cx = -4; cx <= 6; cx++) for (let cz = -5; cz <= 5; cz++) {
      const plan = planChunk(seed, { cx, cz });
      for (const c of plan.connectors.filter((k) => !['river', 'creek'].includes(k.kind))) {
        const point = c.edge === 'north' ? { x: c.offset, z: 0 } : c.edge === 'south' ? { x: c.offset, z: CHUNK_SIZE } : c.edge === 'west' ? { x: 0, z: c.offset } : { x: CHUNK_SIZE, z: c.offset };
        const touches = plan.roads.some((r) => [r.from, r.to].some((p) => p.x === point.x && p.z === point.z));
        const bridged = plan.bridges.some((b) => point.x >= b.rect.minX && point.x <= b.rect.maxX && point.z >= b.rect.minZ && point.z <= b.rect.maxZ);
        expect(touches || bridged, `${cx},${cz} ${c.edge}@${c.offset}`).toBe(true);
      }
    }
  });

  it('keeps the spawn box on land and reserves exactly one hotel near spawn', () => {
    for (const seed of SEEDS) {
      const layout = worldLayout(seed);
      const hotels: string[] = [];
      for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) {
        const plan = planChunk(seed, { cx, cz });
        if (inSpawnBox({ cx, cz })) expect(plan.water).toEqual([]);
        if (plan.requiredAnchors.some((a) => a.capability === 'hotel-landmark')) hotels.push(chunkKey({ cx, cz }));
      }
      expect(hotels).toEqual([chunkKey(layout.hotel.coord)]);
      const d = Math.max(Math.abs(layout.hotel.coord.cx), Math.abs(layout.hotel.coord.cz));
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(3);
      expect(planChunk(seed, { cx: 0, cz: 0 }).requiredAnchors.map((a) => a.capability)).toContain('drink-vendor');
    }
  });

  it('runs one continuous Huangpu corridor with promenades and guaranteed viewpoints', () => {
    for (const seed of SEEDS) {
      for (let cz = -10; cz <= 10; cz++) {
        const river = [3, 4].map((cx) => planChunk(seed, { cx, cz }).water.find((w) => w.kind === 'river'));
        expect(river.every(Boolean)).toBe(true);
        expect(river[0]!.rect.maxX).toBe(CHUNK_SIZE);
        expect(river[1]!.rect.minX).toBe(0);
        expect(districtOf(seed, { cx: 3, cz })).toBe('waterfront');
      }
      const viewpoint = planChunk(seed, { cx: 3, cz: 0 }).requiredAnchors.map((a) => a.capability);
      expect(viewpoint).toEqual(expect.arrayContaining(['river-viewpoint', 'photo-passerby']));
    }
  });

  it('roughly follows district targets with shopping the largest land use', () => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const seed of SEEDS) for (let cx = -20; cx <= 2; cx++) for (let cz = -20; cz <= 20; cz++) { const d = districtOf(seed, { cx, cz }); counts[d] = (counts[d] ?? 0) + 1; total++; }
    const largest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
    expect(largest).toBe('shopping');
    expect(counts.shopping! / total).toBeGreaterThan(0.2);
    expect(Object.keys(counts).sort()).toEqual(['park', 'shopping', 'waterfront']);
    expect(DISTRICT_TARGETS.shopping).toBeGreaterThan(DISTRICT_TARGETS.historic);
  });
});
