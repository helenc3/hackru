import { describe, expect, it } from 'vitest';
import { AssetIdSchema, ParamSpecSchema } from '../../src/city/contracts.js';
import { anchorsEntries } from '../../src/city/catalog/anchors.js';
import { resolveParams } from '../../src/city/catalog/index.js';

const extremes = (entry: (typeof anchorsEntries)[number]) => {
  const sets = [resolveParams(entry)];
  for (const [key, spec] of Object.entries(entry.params)) {
    if (spec.type === 'number' || spec.type === 'int') sets.push(resolveParams(entry, { [key]: spec.min }), resolveParams(entry, { [key]: spec.max }));
    if (spec.type === 'enum') for (const value of spec.values) sets.push(resolveParams(entry, { [key]: value }));
  }
  return sets;
};

describe('anchor catalog', () => {
  it('covers every quest capability, with a unique hotel', () => {
    const caps = anchorsEntries.flatMap((entry) => entry.capabilities);
    for (const capability of ['drink-vendor', 'direction-helper', 'hotel-landmark', 'river-viewpoint', 'photo-passerby', 'readable-sign'] as const) expect(caps).toContain(capability);
    expect(anchorsEntries.filter((entry) => entry.capabilities.includes('hotel-landmark')).map((entry) => entry.id)).toEqual(['an.hotel.grand']);
    expect(anchorsEntries.length).toBeGreaterThanOrEqual(7);
  });

  it('declares valid IDs, params, and collision inside the footprint at every extreme', () => {
    for (const entry of anchorsEntries) {
      expect(AssetIdSchema.parse(entry.id)).toBe(entry.id);
      expect(entry.category).toBe('anchor');
      expect(entry.capabilities.length).toBeGreaterThan(0);
      Object.values(entry.params).forEach((spec) => ParamSpecSchema.parse(spec));
      for (const params of extremes(entry)) {
        const { w, d, h } = entry.footprint(params);
        expect(w > 0 && d > 0 && h > 0).toBe(true);
        const { solids, walkable } = entry.collision(params);
        for (const r of [...solids, ...walkable]) {
          expect(r.minX).toBeGreaterThanOrEqual(-w / 2 - 1e-9); expect(r.maxX).toBeLessThanOrEqual(w / 2 + 1e-9);
          expect(r.minZ).toBeGreaterThanOrEqual(-d / 2 - 1e-9); expect(r.maxZ).toBeLessThanOrEqual(d / 2 + 1e-9);
        }
      }
    }
  });

  it('rejects unreviewed sign text and out-of-range params', () => {
    const menu = anchorsEntries.find((entry) => entry.id === 'an.sign.menu')!;
    expect(() => resolveParams(menu, { textKey: '随便写' })).toThrow();
    const hotel = anchorsEntries.find((entry) => entry.id === 'an.hotel.grand')!;
    expect(() => resolveParams(hotel, { floors: 40 })).toThrow();
    expect(() => resolveParams(hotel, { label: 'x' })).toThrow();
  });

  it('gives vendor counters an npc socket for the vendor figure', () => {
    const figure = anchorsEntries.find((entry) => entry.id === 'an.npc.vendor')!;
    expect(figure.placement).toBe('socket');
    for (const id of ['an.vendor.cafe-counter', 'an.vendor.drink-stall', 'an.vendor.convenience']) {
      const entry = anchorsEntries.find((candidate) => candidate.id === id)!;
      expect(entry.sockets(resolveParams(entry)).some((s) => figure.attachesTo!.includes(s.kind))).toBe(true);
    }
  });
});
