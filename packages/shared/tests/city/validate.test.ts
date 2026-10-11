import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/city/catalog/index.js', async () => (await import('./fake-city.js')).fakeCatalogModule);
const { sealManifest } = await import('../../src/city/hash.js');
const { connectorPoint, deriveCollision, repairManifest, rotateRect, validateManifest } = await import('../../src/city/validate.js');
const { manifest, plan } = await import('./fake-city.js');

const shop = (id: string, x: number, z: number, extra = {}) => ({ id, assetId: 'bld.test.box', params: {}, x, z, rotation: 0 as const, ...extra });
const errors = (r: ReturnType<typeof validateManifest>) => (r.ok ? [] : r.errors).join('\n');

describe('validateManifest', () => {
  const p = plan();
  it('accepts a clean chunk', () => {
    const m = sealManifest(manifest(p, { placements: [shop('a', 10, 10), shop('b', 14, 10)] }));
    expect(errors(validateManifest(m, p))).toBe('');
  });
  it('rejects unknown assets, bad params, unapproved, and tampered hashes', () => {
    const m = sealManifest(manifest(p, { placements: [{ ...shop('a', 10, 10), assetId: 'bld.nope' }, shop('b', 20, 30, { params: { width: 99 } }), shop('c', 30, 8, { params: { colour: 1 } }), { ...shop('d', 30, 32), assetId: 'bld.test.pending' }] }));
    const e = errors(validateManifest(m, p));
    expect(e).toMatch(/unknown asset bld.nope/); expect(e).toMatch(/width out of range/); expect(e).toMatch(/unknown param colour/); expect(e).toMatch(/not approved/);
    expect(errors(validateManifest({ ...m, seed: 'other' }, p))).toMatch(/contentHash/);
  });
  it('rejects overlaps with roads, water, buildings, clearance, and the chunk edge', () => {
    const water = plan({ water: [{ id: 'w', kind: 'creek', rect: { minX: 0, maxX: 40, minZ: 30, maxZ: 36 } }] });
    const m = sealManifest(manifest(water, { placements: [shop('road', 10, 19), shop('wet', 10, 31), shop('a', 30, 8), shop('b', 31, 9), shop('front', 5, 8), shop('front2', 5, 12.5), shop('edge', 1, 5)] }));
    const e = errors(validateManifest(m, water));
    for (const id of ['road', 'wet', 'b', 'front2', 'edge']) expect(e).toContain(`placement ${id}:`);
    expect(e).not.toContain('placement a:');
  });
  it('checks socket attachments', () => {
    const m = sealManifest(manifest(p, { placements: [shop('a', 10, 10), { ...shop('s', 10, 12), assetId: 'sf.test.sign', attachTo: { placementId: 'a', socketId: 'sign' } }, { ...shop('w', 10, 12), assetId: 'sf.test.awning', attachTo: { placementId: 'a', socketId: 'sign' } }, { ...shop('loose', 30, 30), assetId: 'sf.test.sign' }] }));
    const e = errors(validateManifest(m, p));
    expect(e).not.toContain('placement s:'); expect(e).toMatch(/placement w: incompatible socket/); expect(e).toMatch(/placement loose: .*must attach/);
  });
  it('enforces plan connectors, water, roads and required anchors', () => {
    const required = plan({ requiredAnchors: [{ capability: 'drink-vendor', anchorId: 'a:vendor' }] });
    const m = sealManifest(manifest(required, { connectors: [], roads: [] }));
    const e = errors(validateManifest(m, required));
    expect(e).toMatch(/connectors differ/); expect(e).toMatch(/planner road r.main/); expect(e).toMatch(/required drink-vendor anchor/);
  });
  it('binds anchor capability to the placement entry and the hotel to the reserved spot', () => {
    const m = sealManifest(manifest(plan(), {
      placements: [shop('a', 10, 10), { ...shop('stall', 30, 10), assetId: 'an.test.stall' }, { ...shop('h', 25, 32), assetId: 'an.hotel.grand' }],
      anchors: [{ id: 'x1', placementId: 'a', capability: 'drink-vendor', kind: 'npc', role: 'vendor', x: 10, z: 13 },
        { id: 'x2', placementId: 'stall', capability: 'drink-vendor', kind: 'npc', role: 'guide', x: 30, z: 12 },
        { id: 'x3', placementId: 'stall', capability: 'drink-vendor', kind: 'npc', role: 'vendor', x: 30, z: 12 }],
    }));
    const e = errors(validateManifest(m, plan()));
    expect(e).toMatch(/anchor x1: bld.test.box does not grant/); expect(e).toMatch(/anchor x2: .*role vendor/); expect(e).not.toContain('anchor x3');
    expect(e).toMatch(/placement h: the hotel exists only/);
  });
  it('rejects NPC anchors with nobody standing there or the wrong required name', () => {
    const named = plan({ requiredAnchors: [{ capability: 'drink-vendor', anchorId: 'v', nameKey: 'laowang' }] });
    const board = sealManifest(manifest(named, {
      placements: [{ ...shop('a', 10, 10), assetId: 'bld.test.box' }, { ...shop('stall', 30, 10), assetId: 'an.test.stall', params: {} }],
      anchors: [{ id: 'v', placementId: 'stall', capability: 'drink-vendor', kind: 'npc', role: 'vendor', nameKey: 'xiaolin', x: 30, z: 12 }],
    }));
    expect(errors(validateManifest(board, named))).toMatch(/must be named laowang/);
  });
  it('detects blocked connectors and unreachable anchors', () => {
    // A viewpoint stand point in the middle of a creek with no deck is unreachable.
    const wet = plan({ water: [{ id: 'w', kind: 'creek', rect: { minX: 0, maxX: 40, minZ: 28, maxZ: 40 } }] });
    const m = sealManifest(manifest(wet, {
      placements: [{ ...shop('view', 20, 34), assetId: 'an.test.viewpoint' }],
      anchors: [{ id: 'v', placementId: 'view', capability: 'river-viewpoint', kind: 'landmark', x: 20, z: 34 }],
    }));
    expect(errors(validateManifest(m, wet))).toMatch(/anchor v stand point is unreachable/);
    const blocked = sealManifest(manifest(p, { placements: [shop('plug', 2, 20)] }));
    expect(errors(validateManifest(blocked, p))).toMatch(/solid overlaps a road/);
  });
  it('repairs deterministically by dropping offenders and keeps required anchors', () => {
    const required = plan({ requiredAnchors: [{ capability: 'drink-vendor', anchorId: 'v' }] });
    const raw = sealManifest(manifest(required, {
      connectors: [], placements: [{ ...shop('stall', 30, 10), assetId: 'an.test.stall' }, shop('bad', 10, 19), shop('a', 10, 8), shop('b', 11, 9)],
      anchors: [{ id: 'v', placementId: 'stall', capability: 'drink-vendor', kind: 'npc', role: 'vendor', x: 30, z: 12 }],
    }));
    const fixed = repairManifest(raw, required)!;
    expect(validateManifest(fixed, required)).toEqual({ ok: true });
    expect(fixed.placements.map((pl) => pl.id)).toEqual(['stall', 'a']);
    expect(repairManifest(raw, required)).toEqual(fixed);
    const doomed = sealManifest(manifest(required, { placements: [{ ...shop('stall', 30, 19), assetId: 'an.test.stall' }], anchors: [{ id: 'v', placementId: 'stall', capability: 'drink-vendor', kind: 'npc', role: 'vendor', x: 30, z: 22 }] }));
    expect(repairManifest(doomed, required)).toBeNull();
  });
});

describe('geometry helpers', () => {
  it('rotates like three.js rotation.y and places connectors on frozen edges', () => {
    expect(rotateRect({ minX: 0, maxX: 2, minZ: 0, maxZ: 1 }, 90)).toEqual({ minX: 0, maxX: 1, minZ: -2, maxZ: 0 });
    expect(connectorPoint({ edge: 'north', kind: 'street', offset: 12, width: 6 })).toEqual({ x: 12, z: 0 });
    expect(connectorPoint({ edge: 'east', kind: 'street', offset: 12, width: 6 })).toEqual({ x: 40, z: 12 });
  });
  it('derives world-coordinate collision including bridges', () => {
    const p = plan({ coord: { cx: 1, cz: -1 } });
    const c = deriveCollision(sealManifest(manifest(p, { placements: [shop('a', 10, 10)], bridges: [{ id: 'b', assetId: 'wf.test.bridge', rect: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 }, axis: 'x' }] })));
    expect(c.solids[0]).toEqual({ minX: 48, maxX: 52, minZ: -32, maxZ: -28 });
    expect(c.walkable[0]).toEqual({ minX: 40, maxX: 44, minZ: -40, maxZ: -36 });
  });
});
