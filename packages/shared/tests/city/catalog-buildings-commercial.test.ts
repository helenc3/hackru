import { describe, expect, it } from 'vitest';
import { buildingsCommercialEntries } from '../../src/city/catalog/buildings-commercial.js';
import { resolveParams } from '../../src/city/catalog/index.js';
import type { CatalogEntry, ParamValues } from '../../src/city/contracts.js';

/** min / default / max for every numeric param, first and last enum values, both booleans. */
function extremes(entry: CatalogEntry): ParamValues[] {
  const pick = (which: 'min' | 'max'): ParamValues => Object.fromEntries(Object.entries(entry.params).map(([key, spec]) => [key,
    spec.type === 'number' || spec.type === 'int' ? spec[which] : spec.type === 'enum' ? spec.values[which === 'min' ? 0 : spec.values.length - 1]! : spec.type === 'boolean' ? which === 'max' : spec.default]));
  return [resolveParams(entry), resolveParams(entry, pick('min')), resolveParams(entry, pick('max'))];
}

describe('buildings-commercial catalog', () => {
  it('has ≥ 11 distinct building entries with the bld. prefix', () => {
    expect(buildingsCommercialEntries.length).toBeGreaterThanOrEqual(11);
    expect(new Set(buildingsCommercialEntries.map((entry) => entry.id)).size).toBe(buildingsCommercialEntries.length);
    for (const entry of buildingsCommercialEntries) { expect(entry.id).toMatch(/^bld\./); expect(entry.category).toBe('building'); }
  });

  it('rejects unknown and out-of-range params', () => {
    const shop = buildingsCommercialEntries.find((entry) => entry.id === 'bld.shop.twostory')!;
    expect(() => resolveParams(shop, { width: 99 })).toThrow();
    expect(() => resolveParams(shop, { floors: 2.5 })).toThrow();
    expect(() => resolveParams(shop, { roofGarden: true })).toThrow();
  });

  for (const entry of buildingsCommercialEntries) it(`${entry.id}: collision and sockets stay inside the footprint at param extremes`, () => {
    for (const params of extremes(entry)) {
      const { w, d, h } = entry.footprint(params);
      expect(w).toBeGreaterThan(0); expect(d).toBeGreaterThan(0); expect(h).toBeGreaterThan(0); expect(h).toBeLessThanOrEqual(30);
      const { solids, walkable } = entry.collision(params);
      expect(solids.length).toBeGreaterThan(0);
      for (const r of [...solids, ...walkable]) {
        expect(r.minX).toBeGreaterThanOrEqual(-w / 2 - 1e-9); expect(r.maxX).toBeLessThanOrEqual(w / 2 + 1e-9);
        expect(r.minZ).toBeGreaterThanOrEqual(-d / 2 - 1e-9); expect(r.maxZ).toBeLessThanOrEqual(d / 2 + 1e-9);
        expect(r.minX).toBeLessThan(r.maxX); expect(r.minZ).toBeLessThan(r.maxZ);
      }
      const sockets = entry.sockets(params);
      expect(new Set(sockets.map((socket) => socket.id)).size).toBe(sockets.length);
      for (const s of sockets) {
        expect(Math.abs(s.x)).toBeLessThanOrEqual(w / 2 + 1e-9); expect(Math.abs(s.z)).toBeLessThanOrEqual(d / 2 + 1e-9);
        expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(h);
      }
    }
  });

  it('every shop-type entry offers a storefront, door, or counter socket for storefront modules', () => {
    for (const entry of buildingsCommercialEntries) expect(entry.sockets(resolveParams(entry)).some((s) => ['storefront', 'door', 'counter'].includes(s.kind))).toBe(true);
  });
});
