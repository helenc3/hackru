import { describe, expect, it } from 'vitest';
import { AssetIdSchema, type CatalogEntry, type ParamValues, type Rect } from '../../src/city/contracts.js';
import { resolveParams } from '../../src/city/catalog/index.js';
import { buildingsResidentialEntries } from '../../src/city/catalog/buildings-residential.js';

const extremes = (entry: CatalogEntry): ParamValues[] => {
  const pick = (which: 'min' | 'max'): ParamValues => Object.fromEntries(Object.entries(entry.params).map(([key, spec]) =>
    [key, spec.type === 'number' || spec.type === 'int' ? spec[which] : spec.type === 'enum' ? spec.values[which === 'min' ? 0 : spec.values.length - 1]! : spec.type === 'boolean' ? which === 'max' : spec.default]));
  return [{}, pick('min'), pick('max')];
};
const inside = (r: Rect, w: number, d: number) => r.minX >= -w / 2 - 1e-9 && r.maxX <= w / 2 + 1e-9 && r.minZ >= -d / 2 - 1e-9 && r.maxZ <= d / 2 + 1e-9;
const overlap = (a: Rect, b: Rect) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minZ < b.maxZ - 1e-9 && b.minZ < a.maxZ - 1e-9;

describe('buildings-residential catalog', () => {
  it('has at least 9 distinct building entries', () => {
    expect(buildingsResidentialEntries.length).toBeGreaterThanOrEqual(9);
    expect(new Set(buildingsResidentialEntries.map((entry) => entry.id)).size).toBe(buildingsResidentialEntries.length);
    for (const entry of buildingsResidentialEntries) {
      expect(AssetIdSchema.parse(entry.id)).toMatch(/^bld\./);
      expect(entry.category).toBe('building');
    }
  });
  for (const entry of buildingsResidentialEntries) it(`${entry.id}: geometry is consistent at min/default/max params`, () => {
    for (const raw of extremes(entry)) {
      const params = resolveParams(entry, raw);
      const { w, d, h } = entry.footprint(params);
      expect(w > 0 && d > 0 && h > 0 && h <= 32).toBe(true);
      const { solids, walkable } = entry.collision(params);
      expect(solids.length).toBeGreaterThan(0);
      for (const rect of [...solids, ...walkable]) expect(inside(rect, w, d)).toBe(true);
      for (const a of walkable) for (const b of solids) expect(overlap(a, b)).toBe(false);
      for (const socket of entry.sockets(params)) {
        expect(Math.abs(socket.x) <= w / 2 + 1e-9 && Math.abs(socket.z) <= d / 2 + 1e-9 && socket.y >= 0 && socket.y <= h).toBe(true);
      }
    }
  });
  it('rejects out-of-range and unknown params', () => {
    const row = buildingsResidentialEntries.find((entry) => entry.id === 'bld.lanehouse.row')!;
    expect(() => resolveParams(row, { bays: 9 })).toThrow();
    expect(() => resolveParams(row, { colour: 'red' })).toThrow();
  });
});
