import type { CatalogEntry, ChunkManifest, ChunkPlan, ParamValues } from '../../src/city/contracts.js';

// Tiny stand-in catalog for validator/world-view/directions unit tests (vi.mock'd into catalog/index.js).
const box = (w: number, d: number) => ({ minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 });
const entry = (over: Partial<CatalogEntry> & Pick<CatalogEntry, 'id' | 'category'>): CatalogEntry => ({
  version: 1, component: 'X', description: 'test', districts: ['shopping'], params: {}, placement: 'ground',
  footprint: () => ({ w: 4, d: 4, h: 3 }), collision: () => ({ solids: [box(4, 4)], walkable: [] }), sockets: () => [],
  clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 100 }, cost: { triangles: 100, drawCalls: 1, instanced: false }, review: 'approved', ...over,
});
export const FAKE_CATALOG: CatalogEntry[] = [
  entry({ id: 'bld.test.box', category: 'building', params: { width: { type: 'number', min: 2, max: 10, default: 4, description: 'w' } },
    footprint: (p: ParamValues) => ({ w: p.width as number, d: 4, h: 3 }), collision: (p: ParamValues) => ({ solids: [box(p.width as number, 4)], walkable: [] }),
    sockets: () => [{ id: 'sign', kind: 'sign', x: 0, y: 2, z: 2, facing: 0 }], clearance: { front: 1, side: 0 } }),
  entry({ id: 'sf.test.sign', category: 'storefront', placement: 'socket', attachesTo: ['sign'], collision: () => ({ solids: [], walkable: [] }), footprint: () => ({ w: 1, d: 0.2, h: 1 }) }),
  entry({ id: 'sf.test.awning', category: 'storefront', placement: 'socket', attachesTo: ['awning'], collision: () => ({ solids: [], walkable: [] }) }),
  entry({ id: 'an.npc.test-stall', category: 'anchor', capabilities: ['drink-vendor'], footprint: () => ({ w: 2, d: 2, h: 2 }), collision: () => ({ solids: [box(2, 2)], walkable: [] }) }),
  entry({ id: 'an.hotel.grand', category: 'anchor', capabilities: ['hotel-landmark'], footprint: () => ({ w: 8, d: 8, h: 10 }), collision: () => ({ solids: [box(8, 8)], walkable: [] }) }),
  entry({ id: 'an.test.landmark', category: 'anchor', capabilities: [], footprint: () => ({ w: 1, d: 1, h: 1 }), collision: () => ({ solids: [], walkable: [] }) }),
  entry({ id: 'an.test.viewpoint', category: 'anchor', placement: 'water-edge', capabilities: ['river-viewpoint'], footprint: () => ({ w: 1, d: 1, h: 1 }), collision: () => ({ solids: [], walkable: [] }) }),
  entry({ id: 'wf.test.bridge', category: 'waterfront', placement: 'water', collision: () => ({ solids: [], walkable: [] }) }),
  entry({ id: 'bld.test.pending', category: 'building', review: 'pending' }),
];
export const fakeCatalogModule = {
  CATALOG_VERSION: 'test-catalog',
  CATALOG: FAKE_CATALOG,
  catalogEntry: (id: string) => FAKE_CATALOG.find((e) => e.id === id),
  resolveParams: (e: CatalogEntry, raw: ParamValues = {}) => {
    const out: ParamValues = {};
    for (const k of Object.keys(raw)) if (!(k in e.params)) throw new Error(`${e.id}: unknown param ${k}`);
    for (const [k, spec] of Object.entries(e.params)) {
      const v = raw[k] ?? spec.default;
      if (spec.type === 'number' && (typeof v !== 'number' || v < spec.min || v > spec.max)) throw new Error(`${e.id}: ${k} out of range`);
      out[k] = v;
    }
    return out;
  },
  catalogForPrompt: () => [],
};

/** A plain shopping chunk: one east-west street across the middle (z = 20), connectors west/east. */
export function plan(over: Partial<ChunkPlan> = {}): ChunkPlan {
  return {
    coord: { cx: 0, cz: 0 }, district: 'shopping',
    connectors: [{ edge: 'west', kind: 'street', offset: 20, width: 8 }, { edge: 'east', kind: 'street', offset: 20, width: 8 }],
    water: [], bridges: [], roads: [{ id: 'r.main', kind: 'street', from: { x: 0, z: 20 }, to: { x: 40, z: 20 }, width: 8, nameKey: 'nanjing' }],
    requiredAnchors: [], neighbours: { north: 'shopping', east: 'shopping', south: 'shopping', west: 'shopping' }, ...over,
  };
}
export function manifest(p: ChunkPlan, over: Partial<ChunkManifest> = {}): Omit<ChunkManifest, 'contentHash'> {
  return {
    worldId: 'w-test', coord: p.coord, district: p.district, catalogVersion: 'test-catalog', generatorVersion: 1, seed: 's',
    source: 'fixture', questContext: { missionId: 'Q1', weights: { 'drink-vendor': 1, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 } }, connectors: p.connectors, roads: p.roads, water: p.water, bridges: [],
    placements: [], anchors: [], missingCapabilities: [], ...over,
  };
}
