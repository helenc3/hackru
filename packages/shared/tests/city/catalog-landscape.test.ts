import { describe, expect, it } from 'vitest';
import { AssetIdSchema, ParamSpecSchema, type ParamValues } from '../../src/city/contracts.js';
import { landscapeEntries } from '../../src/city/catalog/landscape.js';

const extremes = (entry: (typeof landscapeEntries)[number]): ParamValues[] => {
  const pick = (end: 'min' | 'max') => Object.fromEntries(Object.entries(entry.params).map(([key, spec]) =>
    [key, spec.type === 'number' || spec.type === 'int' ? spec[end] : spec.type === 'enum' ? spec.values[end === 'min' ? 0 : spec.values.length - 1]! : spec.default]));
  const defaults = Object.fromEntries(Object.entries(entry.params).map(([key, spec]) => [key, spec.default]));
  return [pick('min'), defaults, pick('max')];
};

describe('landscape catalog', () => {
  it('has at least 9 distinct, approved, well-formed entries', () => {
    expect(landscapeEntries.length).toBeGreaterThanOrEqual(9);
    expect(new Set(landscapeEntries.map((entry) => entry.id)).size).toBe(landscapeEntries.length);
    for (const entry of landscapeEntries) {
      expect(AssetIdSchema.parse(entry.id).startsWith('ls.')).toBe(true);
      expect(entry.category).toBe('landscape');
      expect(entry.review).toBe('approved');
      for (const spec of Object.values(entry.params)) ParamSpecSchema.parse(spec);
    }
  });
  it('keeps collision inside the footprint at parameter extremes', () => {
    for (const entry of landscapeEntries) for (const params of extremes(entry)) {
      const { w, d, h } = entry.footprint(params);
      expect(w > 0 && d > 0 && h > 0).toBe(true);
      const { solids, walkable } = entry.collision(params);
      for (const rect of [...solids, ...walkable]) {
        expect(rect.minX).toBeGreaterThanOrEqual(-w / 2 - 1e-9); expect(rect.maxX).toBeLessThanOrEqual(w / 2 + 1e-9);
        expect(rect.minZ).toBeGreaterThanOrEqual(-d / 2 - 1e-9); expect(rect.maxZ).toBeLessThanOrEqual(d / 2 + 1e-9);
      }
    }
  });
  it('lets players walk under tree canopies and across lawns and courtyards', () => {
    for (const entry of landscapeEntries.filter((item) => item.id.startsWith('ls.tree.'))) {
      const params = extremes(entry)[1]!;
      const [trunk] = entry.collision(params).solids;
      expect(entry.cost.instanced).toBe(true);
      expect(trunk!.maxX - trunk!.minX).toBeLessThan(entry.footprint(params).w / 4);
    }
    for (const id of ['ls.park.lawn', 'ls.courtyard.tiles']) {
      const entry = landscapeEntries.find((item) => item.id === id)!;
      const shape = entry.collision(extremes(entry)[1]!);
      expect(shape.solids).toEqual([]); expect(shape.walkable).toHaveLength(1);
    }
  });
});
