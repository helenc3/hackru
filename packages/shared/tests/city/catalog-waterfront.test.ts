import { describe, expect, it } from 'vitest';
import { waterfrontEntries } from '../../src/city/catalog/waterfront.js';
import { ParamSpecSchema, type CatalogEntry, type ParamValues, type Rect } from '../../src/city/contracts.js';

const extremes = (entry: CatalogEntry): ParamValues[] => {
  const pick = (side: 'min' | 'default' | 'max') => Object.fromEntries(Object.entries(entry.params).map(([key, spec]) => [key,
    spec.type === 'number' || spec.type === 'int' ? (side === 'default' ? spec.default : spec[side])
      : spec.type === 'enum' ? (side === 'max' ? spec.values.at(-1)! : side === 'min' ? spec.values[0]! : spec.default)
        : spec.type === 'boolean' ? (side === 'default' ? spec.default : side === 'max') : spec.default]));
  return [pick('min'), pick('default'), pick('max')];
};
const inside = (r: Rect, w: number, d: number) => r.minX >= -w / 2 - 1e-9 && r.maxX <= w / 2 + 1e-9 && r.minZ >= -d / 2 - 1e-9 && r.maxZ <= d / 2 + 1e-9;
const overlap = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

describe('waterfront catalog', () => {
  it('has ≥ 8 distinct, approved, waterfront-prefixed entries', () => {
    expect(waterfrontEntries.length).toBeGreaterThanOrEqual(8);
    expect(new Set(waterfrontEntries.map((e) => e.id)).size).toBe(waterfrontEntries.length);
    expect(new Set(waterfrontEntries.map((e) => e.component)).size).toBe(waterfrontEntries.length);
    for (const entry of waterfrontEntries) {
      expect(entry.id).toMatch(/^wf\./);
      expect(entry.category).toBe('waterfront');
      expect(entry.review).toBe('approved');
      for (const spec of Object.values(entry.params)) expect(() => ParamSpecSchema.parse(spec)).not.toThrow();
    }
  });

  it('keeps collision inside the footprint and walkable decks clear of solids at parameter extremes', () => {
    for (const entry of waterfrontEntries) for (const params of extremes(entry)) {
      const { w, d, h } = entry.footprint(params);
      expect(w > 0 && d > 0 && h > 0, entry.id).toBe(true);
      const { solids, walkable } = entry.collision(params);
      for (const r of [...solids, ...walkable]) expect(inside(r, w, d), `${entry.id} ${JSON.stringify(params)}`).toBe(true);
      for (const s of solids) for (const deck of walkable) expect(overlap(s, deck), `${entry.id} solid overlaps deck`).toBe(false);
      for (const socket of entry.sockets(params)) expect(Math.abs(socket.x) <= w / 2 && Math.abs(socket.z) <= d / 2, `${entry.id} socket ${socket.id}`).toBe(true);
    }
  });

  it('declares walkable bridge, promenade, and pier decks; the bridge spans its length param', () => {
    for (const id of ['wf.bridge.level', 'wf.promenade', 'wf.pier.viewing']) {
      const entry = waterfrontEntries.find((e) => e.id === id)!;
      expect(entry.collision(extremes(entry)[1]!).walkable.length, id).toBeGreaterThan(0);
    }
    const bridge = waterfrontEntries.find((e) => e.id === 'wf.bridge.level')!;
    const deck = bridge.collision({ length: 20, width: 5, style: 'stone' }).walkable[0]!;
    expect(deck.maxX - deck.minX).toBe(20);
    expect(bridge.placement).toBe('water');
  });
});
