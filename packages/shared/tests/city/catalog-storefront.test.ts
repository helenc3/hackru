import { describe, expect, it } from 'vitest';
import { storefrontEntries } from '../../src/city/catalog/storefront.js';
import { resolveParams } from '../../src/city/catalog/index.js';

describe('storefront catalog', () => {
  it('has ≥10 approved socket modules with valid params at min/default/max', () => {
    expect(storefrontEntries.length).toBeGreaterThanOrEqual(10);
    for (const entry of storefrontEntries) {
      expect(entry.category).toBe('storefront');
      expect(entry.placement).toBe('socket');
      expect(entry.attachesTo?.length).toBeGreaterThan(0);
      expect(entry.review).toBe('approved');
      for (const pick of ['min', 'default', 'max'] as const) {
        const raw = Object.fromEntries(Object.entries(entry.params).map(([key, spec]) => [key, spec.type === 'number' || spec.type === 'int' ? spec[pick === 'default' ? 'default' : pick] : spec.default]));
        const params = resolveParams(entry, raw);
        const size = entry.footprint(params);
        expect(size.w > 0 && size.d > 0 && size.h > 0).toBe(true);
        for (const r of entry.collision(params).solids) expect(r.maxX - r.minX).toBeLessThanOrEqual(size.w + 1e-9);
      }
    }
  });
  it('signs take text only from the reviewed catalog', () => {
    const signs = storefrontEntries.filter((entry) => entry.id.startsWith('sf.sign.'));
    expect(signs.length).toBe(3);
    for (const sign of signs) {
      expect(sign.params.label?.type).toBe('text');
      expect(() => resolveParams(sign, { label: 'made-up-shop' })).toThrow();
    }
  });
  it('only the counter blocks movement', () => {
    const blocking = storefrontEntries.filter((entry) => entry.collision(resolveParams(entry)).solids.length > 0).map((entry) => entry.id);
    expect(blocking).toEqual(['sf.counter.takeaway']);
  });
});
