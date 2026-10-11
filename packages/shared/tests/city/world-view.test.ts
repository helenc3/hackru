import { describe, expect, it, vi } from 'vitest';
import type { ChunkCoord } from '../../src/city/contracts.js';

vi.mock('../../src/city/catalog/index.js', async () => (await import('./fake-city.js')).fakeCatalogModule);
vi.mock('../../src/city/planner.js', () => ({
  worldLayout: () => ({ spawn: { x: 20, z: 22 }, hotel: { coord: { cx: 0, cz: 0 }, anchorId: 'hotel.grand', local: { x: 5, z: 24 } }, river: { axis: 'z', center: 150, width: 30 } }),
  planChunk: (_seed: string, coord: ChunkCoord) => ({ coord, district: 'park', connectors: [], water: [], requiredAnchors: [], neighbours: {}, roads: [] }),
}));
const { createWorldView } = await import('../../src/city/world-view.js');
const { sealManifest } = await import('../../src/city/hash.js');
const { manifest, plan } = await import('./fake-city.js');

const p = plan({ water: [{ id: 'w', kind: 'creek', rect: { minX: 0, maxX: 40, minZ: 30, maxZ: 36 } }] });
const chunk = sealManifest(manifest(p, {
  placements: [{ id: 'box', assetId: 'bld.test.box', params: {}, x: 10, z: 10, rotation: 0 }, { id: 'stall', assetId: 'an.npc.test-stall', params: {}, x: 30, z: 10, rotation: 0 }],
  bridges: [{ id: 'b', assetId: 'wf.test.bridge', rect: { minX: 18, maxX: 22, minZ: 28, maxZ: 38 }, axis: 'z' }],
  anchors: [{ id: 'guide.1', placementId: 'stall', capability: 'drink-vendor', kind: 'npc', role: 'vendor', x: 30, z: 12 }],
}));
const east = sealManifest(manifest(plan({ coord: { cx: 1, cz: 0 } }), { placements: [{ id: 'edge', assetId: 'bld.test.box', params: {}, x: 2, z: 5, rotation: 0 }] }));
const view = createWorldView('w-test', 'seed', new Map([['0,0', chunk], ['1,0', east]]));

describe('createWorldView', () => {
  it('walks streets, blocks solids, water, and uncommitted chunks, allows bridge decks', () => {
    expect(view.walkable({ x: 5, z: 20 })).toBe(true);
    expect(view.walkable({ x: 10, z: 10 })).toBe(false);
    expect(view.walkable({ x: 10, z: 12.2 })).toBe(false); // player radius touches the box
    expect(view.walkable({ x: 5, z: 33 })).toBe(false);
    expect(view.walkable({ x: 20, z: 33 })).toBe(true);
    expect(view.walkable({ x: 5, z: -5 })).toBe(false);
    expect(view.walkable({ x: 39.9, z: 5 })).toBe(false); // neighbour's solid across the chunk edge
    expect(view.committed({ cx: 1, cz: 0 })).toBe(true);
    expect(view.committed({ cx: 2, cz: 0 })).toBe(false);
  });
  it('reports districts from manifests, else the plan', () => {
    expect(view.districtAt({ x: 1, z: 1 })).toBe('shopping');
    expect(view.districtAt({ x: 100, z: 1 })).toBe('park');
  });
  it('finds anchors by id and by distance in world coordinates', () => {
    expect(view.anchor('guide.1')).toMatchObject({ position: { x: 30, z: 12 }, chunk: '0,0', role: 'vendor' });
    expect(view.anchor('nope')).toBeUndefined();
    expect(view.anchorsNear({ x: 31, z: 12 }, 2).map((a) => a.id)).toEqual(['guide.1']);
    expect(view.anchorsNear({ x: 0, z: 0 }, 5)).toEqual([]);
  });
  it('routes from an anchor to the hotel', () => {
    expect(view.directionsToHotel('nope')).toBeNull();
    expect(view.directionsToHotel('guide.1')?.textZh).toBe('沿着南京路往西走，上海大酒店在左边。');
  });
});
