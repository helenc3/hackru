import { describe, expect, it } from 'vitest';
import { ParamSpecSchema, type ParamValues, type Rect } from '../../src/city/contracts.js';
import { TEXT_CATALOG } from '../../src/city/text-catalog.js';
import { roadTiles, streetEntries } from '../../src/city/catalog/street.js';

const defaults = (params: Record<string, { default: number | string | boolean }>): ParamValues => Object.fromEntries(Object.entries(params).map(([key, spec]) => [key, spec.default]));
const extremes = (entry: (typeof streetEntries)[number]): ParamValues[] => {
  const base = defaults(entry.params);
  return [base, ...Object.entries(entry.params).flatMap(([key, spec]) => spec.type === 'number' || spec.type === 'int' ? [{ ...base, [key]: spec.min }, { ...base, [key]: spec.max }] : spec.type === 'enum' ? spec.values.map((value) => ({ ...base, [key]: value })) : [])];
};
const inside = (r: Rect, w: number, d: number) => r.minX >= -w / 2 - 1e-9 && r.maxX <= w / 2 + 1e-9 && r.minZ >= -d / 2 - 1e-9 && r.maxZ <= d / 2 + 1e-9;

describe('street catalog', () => {
  it('has at least 12 distinct, approved street entries', () => {
    expect(streetEntries.length).toBeGreaterThanOrEqual(12);
    expect(new Set(streetEntries.map((entry) => entry.id)).size).toBe(streetEntries.length);
    for (const entry of streetEntries) {
      expect(entry.id.startsWith('st.')).toBe(true);
      expect(entry.category).toBe('street');
      expect(entry.review).toBe('approved');
    }
  });

  it('declares valid params with defaults in range and reviewed text keys', () => {
    for (const entry of streetEntries) for (const spec of Object.values(entry.params)) {
      ParamSpecSchema.parse(spec);
      if (spec.type === 'number' || spec.type === 'int') expect(spec.default >= spec.min && spec.default <= spec.max, entry.id).toBe(true);
      if (spec.type === 'enum') expect(spec.values).toContain(spec.default);
      if (spec.type === 'text') expect(TEXT_CATALOG[spec.catalog]).toHaveProperty(spec.default);
    }
  });

  it('keeps collision inside the footprint at parameter extremes; tiles are walkable, props solid', () => {
    for (const entry of streetEntries) for (const params of extremes(entry)) {
      const { w, d, h } = entry.footprint(params);
      expect(w > 0 && d > 0 && h > 0, entry.id).toBe(true);
      const shape = entry.collision(params);
      for (const r of [...shape.solids, ...shape.walkable]) expect(inside(r, w, d), `${entry.id} ${JSON.stringify(params)}`).toBe(true);
      if (entry.placement === 'road') expect(shape.walkable.length, entry.id).toBeGreaterThan(0);
      if (entry.placement === 'sidewalk' && entry.id !== 'st.sidewalk') expect(shape.solids.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('leaves passable gaps between bollards', () => {
    const bollard = streetEntries.find((entry) => entry.id === 'st.bollard')!;
    const solids = bollard.collision({ count: 3, spacing: 1.2 }).solids;
    expect(solids).toHaveLength(3);
    expect(solids[1]!.minX - solids[0]!.maxX).toBeGreaterThan(0.7); // > player diameter
  });

  it('maps axis-aligned roads to in-range tiles', () => {
    expect(roadTiles({ id: 'r', kind: 'avenue', from: { x: 0, z: 20 }, to: { x: 40, z: 20 }, width: 12 })).toEqual([{ assetId: 'st.road.straight', params: { length: 40, width: 12, markings: 'double-yellow' }, x: 20, z: 20, rotation: 90 }]);
    expect(roadTiles({ id: 'l', kind: 'lane', from: { x: 5, z: 0 }, to: { x: 5, z: 10 }, width: 3 })[0]).toMatchObject({ assetId: 'st.lane.paved', rotation: 0, z: 5 });
    expect(roadTiles({ id: 'p', kind: 'promenade', from: { x: 0, z: 0 }, to: { x: 0, z: 10 }, width: 6 })).toEqual([]);
  });
});
