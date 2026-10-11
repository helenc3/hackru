import type { CatalogEntry, ParamSpec, ParamValues, Socket } from '../contracts.js';

// Commercial / office / industrial shells. Origin = footprint centre on the ground, +z = street front.
// Geometry is a solid body box (plus an open arcade strip for the arcade shop); the web components
// read footprint() from these entries, so render size and collision cannot drift apart.

const GROUND = 3.2; // ground-floor height (shopfront)
const UPPER = 3; // upper-floor height
const storeyHeight = (floors: number) => GROUND + (floors - 1) * UPPER;

const num = (min: number, max: number, def: number, description: string, step = 0.5): ParamSpec => ({ type: 'number', min, max, default: def, step, description });
const floors = (min: number, max: number, def: number): ParamSpec => ({ type: 'int', min, max, default: def, description: 'Number of storeys' });
const variant = (values: string[], description = 'Façade material variant'): ParamSpec => ({ type: 'enum', values, default: values[0]!, description });
const n = (p: ParamValues, key: string) => p[key] as number;
const box = (w: number, d: number) => ({ minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 });
const front = (id: string, kind: Socket['kind'], x: number, y: number, d: number): Socket => ({ id, kind, x, y, z: d / 2, facing: 0 });

type Spec = Omit<CatalogEntry, 'collision' | 'version' | 'category' | 'review' | 'placement'> & { collision?: CatalogEntry['collision'] };
const entry = (spec: Spec): CatalogEntry => ({
  version: 1, category: 'building', placement: 'ground', review: 'approved',
  collision: (p) => { const { w, d } = spec.footprint(p); return { solids: [box(w, d)], walkable: [] }; },
  ...spec,
});

export const buildingsCommercialEntries: readonly CatalogEntry[] = [
  entry({
    id: 'bld.shop.twostory', component: 'ShopTwoStory', description: 'Narrow 2–3 storey street shop: open ground-floor shopfront, flat upper façade with windows and a small balcony.',
    districts: ['shopping', 'historic'],
    params: { width: num(4, 8, 6, 'Frontage width (m)'), floors: floors(2, 3, 2), variant: variant(['stucco', 'brick', 'tile']) },
    footprint: (p) => ({ w: n(p, 'width'), d: 8, h: storeyHeight(n(p, 'floors')) }),
    sockets: (p) => [front('storefront', 'storefront', 0, 0, 8), front('door', 'door', n(p, 'width') / 2 - 1, 0, 8), front('awning', 'awning', 0, 2.7, 8), front('sign', 'sign', 0, 3.6, 8), front('balcony', 'balcony', 0, GROUND + 0.1, 8)],
    clearance: { front: 2, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 120 }, cost: { triangles: 600, drawCalls: 10, instanced: false },
  }),
  entry({
    id: 'bld.shop.corner', component: 'ShopCorner', description: 'Corner shop block with a chamfered corner entrance and shopfronts on two streets (front and +x side).',
    districts: ['shopping', 'historic'],
    params: { width: num(8, 12, 10, 'Front width (m)'), depth: num(8, 12, 10, 'Side depth (m)'), floors: floors(2, 4, 3), variant: variant(['stucco', 'brick', 'tile']) },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: storeyHeight(n(p, 'floors')) }),
    sockets: (p) => {
      const w = n(p, 'width'), d = n(p, 'depth');
      return [front('storefront', 'storefront', -w / 4, 0, d), front('awning', 'awning', -w / 4, 2.7, d), front('sign', 'sign', -w / 4, 3.6, d),
        { id: 'side-storefront', kind: 'storefront', x: w / 2, y: 0, z: -d / 4, facing: 90 }, { id: 'side-sign', kind: 'sign', x: w / 2, y: 3.6, z: -d / 4, facing: 90 }];
    },
    clearance: { front: 2, side: 2 }, capabilities: [], lod: { levels: 2, cullDistance: 140 }, cost: { triangles: 900, drawCalls: 12, instanced: false },
  }),
  entry({
    id: 'bld.shop.arcade', component: 'ShopArcade', description: 'Qilou-style arcade shop: upper floors over a covered walkway; the 2.5 m arcade strip at the front is walkable.',
    districts: ['shopping', 'historic'],
    params: { width: num(6, 16, 10, 'Frontage width (m)'), floors: floors(2, 4, 3), variant: variant(['stucco', 'tile', 'brick']) },
    footprint: (p) => ({ w: n(p, 'width'), d: 10, h: storeyHeight(n(p, 'floors')) }),
    // Solid shop body behind; columns at the front corners; walkable arcade between them.
    collision: (p) => {
      const w = n(p, 'width');
      return { solids: [{ minX: -w / 2, maxX: w / 2, minZ: -5, maxZ: 2.5 }, { minX: -w / 2, maxX: -w / 2 + 0.5, minZ: 4.5, maxZ: 5 }, { minX: w / 2 - 0.5, maxX: w / 2, minZ: 4.5, maxZ: 5 }], walkable: [{ minX: -w / 2 + 0.5, maxX: w / 2 - 0.5, minZ: 2.5, maxZ: 5 }] };
    },
    sockets: (p) => [{ id: 'storefront', kind: 'storefront', x: 0, y: 0, z: 2.5, facing: 0 }, { id: 'door', kind: 'door', x: n(p, 'width') / 2 - 1.5, y: 0, z: 2.5, facing: 0 }, front('sign', 'sign', 0, GROUND + 0.4, 10), { id: 'lamp', kind: 'lamp', x: 0, y: GROUND - 0.2, z: 3.75, facing: 0 }],
    clearance: { front: 1, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 120 }, cost: { triangles: 800, drawCalls: 12, instanced: false },
  }),
  entry({
    id: 'bld.cafe.small', component: 'CafeSmall', description: 'Single-storey café shell with a full-height glass front, optional roof terrace, counter and awning sockets.',
    districts: ['shopping', 'historic', 'waterfront', 'office'],
    params: { width: num(5, 8, 6, 'Frontage width (m)'), terrace: { type: 'boolean', default: false, description: 'Railed roof terrace' }, variant: variant(['cream', 'mint', 'coral'], 'Paint scheme') },
    footprint: (p) => ({ w: n(p, 'width'), d: 6, h: p.terrace ? GROUND + 1.1 : GROUND + 0.4 }),
    sockets: (p) => [front('counter', 'counter', -n(p, 'width') / 4, 0, 6), front('door', 'door', n(p, 'width') / 2 - 1, 0, 6), front('awning', 'awning', 0, 2.7, 6), front('sign', 'sign', 0, 3.3, 6), front('window', 'window', -n(p, 'width') / 4, 0.4, 6)],
    clearance: { front: 2.5, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 100 }, cost: { triangles: 500, drawCalls: 9, instanced: false },
  }),
  entry({
    id: 'bld.restaurant.dimsum', component: 'RestaurantDimsum', description: 'Two-storey dim-sum restaurant with upturned tiled eaves, lattice upper windows and a lantern-hung entrance.',
    districts: ['shopping', 'historic'],
    params: { width: num(7, 10, 8, 'Frontage width (m)'), variant: variant(['red', 'jade'], 'Lacquer colour') },
    footprint: (p) => ({ w: n(p, 'width'), d: 9, h: storeyHeight(2) + 1.2 }),
    sockets: (p) => [front('door', 'door', 0, 0, 9), front('sign', 'sign', 0, 3.4, 9), front('lamp-left', 'lamp', -n(p, 'width') / 2 + 1, 2.6, 9), front('lamp-right', 'lamp', n(p, 'width') / 2 - 1, 2.6, 9), front('window', 'window', -n(p, 'width') / 4, 4.4, 9)],
    clearance: { front: 2.5, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 120 }, cost: { triangles: 900, drawCalls: 12, instanced: false },
  }),
  entry({
    id: 'bld.restaurant.noodle', component: 'RestaurantNoodle', description: 'Narrow noodle shop: 1–2 storeys, open counter window to the street with a roll-up shutter box.',
    districts: ['shopping', 'historic', 'residential'],
    params: { width: num(4, 6, 5, 'Frontage width (m)'), floors: floors(1, 2, 1), variant: variant(['tile', 'stucco']) },
    footprint: (p) => ({ w: n(p, 'width'), d: 7, h: storeyHeight(n(p, 'floors')) }),
    sockets: (p) => [front('counter', 'counter', -0.6, 0, 7), front('door', 'door', n(p, 'width') / 2 - 0.8, 0, 7), front('awning', 'awning', 0, 2.6, 7), front('sign', 'sign', 0, 2.95, 7)],
    clearance: { front: 2, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 100 }, cost: { triangles: 450, drawCalls: 8, instanced: false },
  }),
  entry({
    id: 'bld.market.hall', component: 'MarketHall', description: 'Wide single-volume wet-market hall with a barrel roof, clerestory band and two large entrances.',
    districts: ['shopping', 'residential'],
    params: { width: num(14, 24, 18, 'Frontage width (m)'), depth: num(12, 18, 14, 'Depth (m)'), variant: variant(['concrete', 'brick']) },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: 7 }),
    sockets: (p) => [front('door-left', 'door', -n(p, 'width') / 4, 0, n(p, 'depth')), front('door-right', 'door', n(p, 'width') / 4, 0, n(p, 'depth')), front('sign', 'sign', 0, 4.4, n(p, 'depth')), front('awning', 'awning', 0, 3, n(p, 'depth'))],
    clearance: { front: 3, side: 1 }, capabilities: [], lod: { levels: 2, cullDistance: 160 }, cost: { triangles: 700, drawCalls: 9, instanced: false },
  }),
  entry({
    id: 'bld.office.glass', component: 'OfficeGlass', description: 'Mid-rise glass office block (4–8 floors) with horizontal floor bands and a lobby entrance.',
    districts: ['office', 'shopping'],
    params: { width: num(12, 20, 16, 'Width (m)'), depth: num(12, 20, 14, 'Depth (m)'), floors: floors(4, 8, 6), variant: variant(['teal', 'silver', 'bronze'], 'Glass tint') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: storeyHeight(n(p, 'floors')) + 0.6 }),
    sockets: (p) => [front('door', 'door', 0, 0, n(p, 'depth')), front('sign', 'sign', 0, GROUND + 0.3, n(p, 'depth')), front('roof', 'roof', 0, storeyHeight(n(p, 'floors')) + 0.6, n(p, 'depth') - 2)],
    clearance: { front: 3, side: 2 }, capabilities: [], lod: { levels: 3, cullDistance: 220 }, cost: { triangles: 800, drawCalls: 10, instanced: false },
  }),
  entry({
    id: 'bld.office.podium', component: 'OfficePodium', description: 'Low 2-storey office podium with a colonnade and three retail bays along the street.',
    districts: ['office', 'shopping'],
    params: { width: num(16, 28, 20, 'Frontage width (m)'), depth: num(10, 16, 12, 'Depth (m)'), variant: variant(['granite', 'sandstone']) },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: storeyHeight(2) + 0.5 }),
    sockets: (p) => {
      const w = n(p, 'width'), d = n(p, 'depth');
      return [...[-1, 0, 1].map((i) => front(`storefront-${i + 1}`, 'storefront', i * w / 3, 0, d)), front('sign', 'sign', 0, GROUND + 0.2, d), front('door', 'door', 0, 0, d)];
    },
    clearance: { front: 3, side: 1 }, capabilities: [], lod: { levels: 2, cullDistance: 180 }, cost: { triangles: 900, drawCalls: 12, instanced: false },
  }),
  entry({
    id: 'bld.office.tower', component: 'OfficeTower', description: 'Slender office tower on a lobby base, ≤ 30 m tall, with a choice of crown (spire, flat, stepped).',
    districts: ['office'],
    params: { width: num(10, 14, 12, 'Tower width (m)'), floors: floors(6, 8, 8), crown: variant(['spire', 'flat', 'stepped'], 'Crown silhouette'), variant: variant(['teal', 'silver', 'bronze'], 'Glass tint') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'width'), h: storeyHeight(n(p, 'floors')) + (p.crown === 'spire' ? 5 : p.crown === 'stepped' ? 2.5 : 0.6) }),
    sockets: (p) => [front('door', 'door', 0, 0, n(p, 'width')), front('sign', 'sign', 0, GROUND + 0.3, n(p, 'width'))],
    clearance: { front: 4, side: 3 }, capabilities: [], lod: { levels: 3, cullDistance: 260 }, cost: { triangles: 1000, drawCalls: 12, instanced: false },
  }),
  entry({
    id: 'bld.warehouse.brick', component: 'WarehouseBrick', description: 'Old brick warehouse (creative-park style) with arched windows, a loading door and optional sawtooth roof.',
    districts: ['industrial', 'waterfront', 'historic'],
    params: { width: num(12, 20, 16, 'Width (m)'), depth: num(10, 16, 12, 'Depth (m)'), sawtooth: { type: 'boolean', default: true, description: 'Sawtooth north-light roof' }, variant: variant(['red', 'grey'], 'Brick colour') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: p.sawtooth ? 8.5 : 7 }),
    sockets: (p) => [front('door', 'door', -n(p, 'width') / 4, 0, n(p, 'depth')), front('sign', 'sign', n(p, 'width') / 4, 4.8, n(p, 'depth'))],
    clearance: { front: 4, side: 1 }, capabilities: [], lod: { levels: 2, cullDistance: 160 }, cost: { triangles: 700, drawCalls: 9, instanced: false },
  }),
  entry({
    id: 'bld.warehouse.shed', component: 'WarehouseShed', description: 'Small corrugated-metal gable shed for loading yards and outskirts, with a roll-up door.',
    districts: ['industrial', 'waterfront'],
    params: { width: num(6, 12, 8, 'Width (m)'), depth: num(6, 10, 8, 'Depth (m)'), variant: variant(['blue', 'grey', 'green'], 'Cladding colour') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: 4.5 }),
    sockets: (p) => [front('door', 'door', 0, 0, n(p, 'depth')), front('sign', 'sign', 0, 3.3, n(p, 'depth'))],
    clearance: { front: 3, side: 0.5 }, capabilities: [], lod: { levels: 1, cullDistance: 100 }, cost: { triangles: 250, drawCalls: 5, instanced: false },
  }),
];
