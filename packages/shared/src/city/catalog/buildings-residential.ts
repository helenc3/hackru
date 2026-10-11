import type { CatalogEntry, ParamSpec, ParamValues, Rect, Socket } from '../contracts.js';

// Residential and historic building kits: shikumen lane houses, walk-ups, slabs, towers,
// compound gates and walls. Geometry is described by collision solids; the web components in
// apps/web/src/city/assets/buildings-residential.tsx extrude exactly these rects.

const num = (p: ParamValues, key: string, fallback: number): number => (typeof p[key] === 'number' ? p[key] as number : fallback);
const str = (p: ParamValues, key: string, fallback: string): string => (typeof p[key] === 'string' ? p[key] as string : fallback);
const bool = (p: ParamValues, key: string, fallback: boolean): boolean => (typeof p[key] === 'boolean' ? p[key] as boolean : fallback);
/** Rect centred at (x, z) with size w × d. */
const box = (x: number, z: number, w: number, d: number): Rect => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
const socket = (id: string, kind: Socket['kind'], x: number, y: number, z: number, facing: Socket['facing'] = 0): Socket => ({ id, kind, x, y, z, facing });

export const LANEHOUSE_BAY = 4.5;
export const LANEHOUSE_DEPTH = 10;
export const STOREY = 3.2;
export const APARTMENT_FLOOR = 3;

export const lanehouseRow = (p: ParamValues) => {
  const bays = num(p, 'bays', 3), stories = num(p, 'stories', 2);
  return { bays, stories, w: bays * LANEHOUSE_BAY, d: LANEHOUSE_DEPTH, wallH: stories * STOREY, h: stories * STOREY + 1.4 };
};
export const lanehouseCorner = (p: ParamValues) => {
  const stories = num(p, 'stories', 2), w = num(p, 'size', 10);
  return { stories, w, d: w, wing: w / 2, wallH: stories * STOREY, h: stories * STOREY + 1.4 };
};
export const laneGate = (p: ParamValues) => {
  const opening = num(p, 'opening', 4), pillar = 1;
  return { opening, pillar, w: opening + pillar * 2, d: 1.2, h: 5.2, archH: 3.6 };
};
export const courtyardHouse = (p: ParamValues) => {
  const w = num(p, 'width', 12), d = num(p, 'depth', 14), gate = 2.4, wall = 0.4, back = d * 0.4, wing = 3;
  return { w, d, gate, wall, back, wing, h: num(p, 'stories', 2) * STOREY + 1.4, wallH: num(p, 'stories', 2) * STOREY, frontWallH: 2.6 };
};
export const apartmentLowrise = (p: ParamValues) => {
  const floors = num(p, 'floors', 5), w = num(p, 'width', 16), d = 11;
  return { floors, w, d, h: floors * APARTMENT_FLOOR + 0.8 };
};
export const apartmentSlab = (p: ParamValues) => {
  const floors = num(p, 'floors', 7), w = num(p, 'width', 26), d = 12;
  return { floors, w, d, h: floors * APARTMENT_FLOOR + 1 };
};
export const apartmentTower = (p: ParamValues) => {
  const floors = num(p, 'floors', 9), s = num(p, 'size', 16);
  return { floors, w: s, d: s, h: floors * APARTMENT_FLOOR + 1.5 };
};
export const compoundGate = (p: ParamValues) => {
  const opening = num(p, 'opening', 7), booth = 2.6, post = 0.8, side = str(p, 'booth', 'left');
  return { opening, booth, post, side, w: opening + booth + post, d: 3, h: 4 };
};
export const compoundWall = (p: ParamValues) => {
  const length = num(p, 'length', 12), height = num(p, 'height', 2.2);
  return { length, height, w: length, d: 0.5, h: height };
};

/** Collision builders, exported so the renderer extrudes the same solids. */
export const residentialSolids = {
  'bld.lanehouse.row': (p: ParamValues) => { const g = lanehouseRow(p); return [box(0, 0, g.w, g.d)]; },
  // L-shape: full-width back wing, front-left wing; the front-right quadrant is an open yard.
  'bld.lanehouse.corner': (p: ParamValues) => { const g = lanehouseCorner(p); return [box(0, -g.d / 4, g.w, g.d / 2), box(-g.w / 4, g.d / 4, g.w / 2, g.d / 2)]; },
  'bld.lanehouse.gate': (p: ParamValues) => { const g = laneGate(p); return [box(-(g.opening + g.pillar) / 2, 0, g.pillar, g.d), box((g.opening + g.pillar) / 2, 0, g.pillar, g.d)]; },
  'bld.lanehouse.courtyard': (p: ParamValues) => {
    const g = courtyardHouse(p), sideW = (g.w - g.gate) / 2;
    return [
      box(0, -g.d / 2 + g.back / 2, g.w, g.back), // main hall
      box(-g.w / 2 + g.wing / 2, g.back / 2 - g.wall / 2, g.wing, g.d - g.back - g.wall), // west wing
      box(g.w / 2 - g.wing / 2, g.back / 2 - g.wall / 2, g.wing, g.d - g.back - g.wall), // east wing
      box(-g.w / 2 + sideW / 2, g.d / 2 - g.wall / 2, sideW, g.wall), // front wall, left of gate
      box(g.w / 2 - sideW / 2, g.d / 2 - g.wall / 2, sideW, g.wall), // front wall, right of gate
    ];
  },
  'bld.apartment.lowrise': (p: ParamValues) => { const g = apartmentLowrise(p); return [box(0, 0, g.w, g.d)]; },
  'bld.apartment.slab': (p: ParamValues) => { const g = apartmentSlab(p); return [box(0, 0, g.w, g.d)]; },
  'bld.apartment.tower': (p: ParamValues) => { const g = apartmentTower(p); return [box(0, 0, g.w, g.d)]; },
  'bld.apartment.compound-gate': (p: ParamValues) => {
    const g = compoundGate(p), left = g.side === 'left';
    const boothX = left ? -g.w / 2 + g.booth / 2 : g.w / 2 - g.booth / 2;
    const postX = left ? g.w / 2 - g.post / 2 : -g.w / 2 + g.post / 2;
    return [box(boothX, 0, g.booth, g.d), box(postX, 0, g.post, g.post)];
  },
  'bld.residential.wall': (p: ParamValues) => { const g = compoundWall(p); return [box(0, 0, g.w, g.d)]; },
} satisfies Record<string, (p: ParamValues) => Rect[]>;

const walkway = (opening: number, d: number): Rect[] => [box(0, 0, opening, d)];
const variant: ParamSpec = { type: 'enum', values: ['grey-brick', 'red-brick', 'stucco'], default: 'grey-brick', description: 'Facade material' };
const tint: ParamSpec = { type: 'enum', values: ['cream', 'peach', 'mint', 'lavender'], default: 'cream', description: 'Facade paint' };

export const buildingsResidentialEntries: readonly CatalogEntry[] = [
  {
    id: 'bld.lanehouse.row', version: 1, component: 'LanehouseRow', category: 'building',
    description: 'Shikumen lane-house terrace: 2-5 bays of stone-framed black doors, upper windows, tiled pitched roof.',
    districts: ['historic', 'residential', 'shopping'], placement: 'ground',
    params: { bays: { type: 'int', min: 2, max: 5, default: 3, description: 'Number of 4.5 m bays' }, stories: { type: 'int', min: 2, max: 3, default: 2, description: 'Storeys' }, variant, shopfront: { type: 'boolean', default: false, description: 'Ground floor opens as small shops (storefront sockets instead of doors)' } },
    footprint: (p) => { const g = lanehouseRow(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => ({ solids: residentialSolids['bld.lanehouse.row'](p), walkable: [] }),
    sockets: (p) => {
      const g = lanehouseRow(p), shop = bool(p, 'shopfront', false);
      return Array.from({ length: g.bays }, (_, i) => {
        const x = -g.w / 2 + LANEHOUSE_BAY * (i + 0.5);
        return [socket(`bay${i}.${shop ? 'shop' : 'door'}`, shop ? 'storefront' : 'door', x, 0, g.d / 2), socket(`bay${i}.window`, 'window', x, STOREY + 1.4, g.d / 2), socket(`bay${i}.sign`, 'sign', x + 1.6, 2.6, g.d / 2)];
      }).flat();
    },
    clearance: { front: 2, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 140 }, cost: { triangles: 1400, drawCalls: 8, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.lanehouse.corner', version: 1, component: 'LanehouseCorner', category: 'building',
    description: 'L-shaped corner lane house closing a terrace at a street corner, with a small open yard.',
    districts: ['historic', 'residential'], placement: 'ground',
    params: { size: { type: 'number', min: 8, max: 12, default: 10, description: 'Square plan size in metres' }, stories: { type: 'int', min: 2, max: 3, default: 2, description: 'Storeys' }, variant },
    footprint: (p) => { const g = lanehouseCorner(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => ({ solids: residentialSolids['bld.lanehouse.corner'](p), walkable: [] }),
    sockets: (p) => { const g = lanehouseCorner(p); return [socket('front.storefront', 'storefront', -g.w / 4, 0, g.d / 2), socket('yard.door', 'door', g.w / 4, 0, 0), socket('side.storefront', 'storefront', g.w / 2, 0, -g.d / 4, 90), socket('front.sign', 'sign', -g.w / 4, 2.6, g.d / 2), socket('upper.balcony', 'balcony', -g.w / 4, STOREY, g.d / 2)]; },
    clearance: { front: 2, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 140 }, cost: { triangles: 1200, drawCalls: 8, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.lanehouse.gate', version: 1, component: 'LaneGate', category: 'building',
    description: 'Stone lane (弄堂) entrance arch with carved lintel and name plaque; the opening is walkable.',
    districts: ['historic', 'residential'], placement: 'ground',
    params: { opening: { type: 'number', min: 3, max: 6, default: 4, description: 'Walkable opening width' }, name: { type: 'text', catalog: 'landmark', default: 'lane-gate', description: 'Plaque text key' } },
    footprint: (p) => { const g = laneGate(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => ({ solids: residentialSolids['bld.lanehouse.gate'](p), walkable: walkway(laneGate(p).opening, laneGate(p).d) }),
    sockets: (p) => { const g = laneGate(p); return [socket('plaque', 'sign', 0, g.archH + 0.6, g.d / 2), socket('lamp.left', 'lamp', -g.w / 2 + g.pillar / 2, 3, g.d / 2), socket('lamp.right', 'lamp', g.w / 2 - g.pillar / 2, 3, g.d / 2)]; },
    clearance: { front: 3, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 100 }, cost: { triangles: 300, drawCalls: 4, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.lanehouse.courtyard', version: 1, component: 'CourtyardHouse', category: 'building',
    description: 'Lane-house compound around a walkable courtyard (天井): main hall, two side wings, front wall with a gate gap.',
    districts: ['historic', 'residential'], placement: 'ground',
    params: { width: { type: 'number', min: 11, max: 16, default: 12, description: 'Frontage width' }, depth: { type: 'number', min: 12, max: 18, default: 14, description: 'Plot depth' }, stories: { type: 'int', min: 1, max: 2, default: 2, description: 'Storeys of hall and wings' }, variant },
    footprint: (p) => { const g = courtyardHouse(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => { const g = courtyardHouse(p); return { solids: residentialSolids['bld.lanehouse.courtyard'](p), walkable: [box(0, g.back / 2 - g.wall / 2, g.w - 2 * g.wing, g.d - g.back - g.wall)] }; },
    sockets: (p) => { const g = courtyardHouse(p); return [socket('gate.sign', 'sign', 0, 2.9, g.d / 2), socket('hall.door', 'door', 0, 0, -g.d / 2 + g.back, 0), socket('gate.lamp', 'lamp', g.gate / 2 + 0.4, 2.2, g.d / 2)]; },
    clearance: { front: 2, side: 0 }, capabilities: [], lod: { levels: 2, cullDistance: 140 }, cost: { triangles: 1800, drawCalls: 10, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.apartment.lowrise', version: 1, component: 'ApartmentLowrise', category: 'building',
    description: 'Walk-up apartment block (老公房) with stacked balconies, AC units and optional ground-floor shops.',
    districts: ['residential', 'shopping', 'historic'], placement: 'ground',
    params: { floors: { type: 'int', min: 3, max: 6, default: 5, description: 'Floors' }, width: { type: 'number', min: 12, max: 20, default: 16, description: 'Frontage width' }, balconies: { type: 'boolean', default: true, description: 'Stacked front balconies' }, groundShops: { type: 'boolean', default: false, description: 'Ground floor shopfronts' }, tint },
    footprint: (p) => { const g = apartmentLowrise(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => ({ solids: residentialSolids['bld.apartment.lowrise'](p), walkable: [] }),
    sockets: (p) => {
      const g = apartmentLowrise(p), shops = bool(p, 'groundShops', false);
      return [-g.w / 4, g.w / 4].flatMap((x, i) => [socket(`ground${i}`, shops ? 'storefront' : 'door', x, 0, g.d / 2), socket(`ground${i}.sign`, 'sign', x, 2.6, g.d / 2)]);
    },
    clearance: { front: 2, side: 1 }, capabilities: [], lod: { levels: 2, cullDistance: 180 }, cost: { triangles: 1600, drawCalls: 6, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.apartment.slab', version: 1, component: 'ApartmentSlab', category: 'building',
    description: 'Long mid-rise apartment slab with horizontal window bands and a rooftop water tank.',
    districts: ['residential'], placement: 'ground',
    params: { floors: { type: 'int', min: 5, max: 9, default: 7, description: 'Floors (≤ 30 m)' }, width: { type: 'number', min: 20, max: 32, default: 26, description: 'Slab length' }, tint },
    footprint: (p) => { const g = apartmentSlab(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => ({ solids: residentialSolids['bld.apartment.slab'](p), walkable: [] }),
    sockets: (p) => { const g = apartmentSlab(p); return [socket('lobby.door', 'door', 0, 0, g.d / 2), socket('lobby.sign', 'sign', 0, 3.2, g.d / 2), socket('roof', 'roof', 0, g.h - 1, 0)]; },
    clearance: { front: 3, side: 2 }, capabilities: [], lod: { levels: 2, cullDistance: 220 }, cost: { triangles: 1200, drawCalls: 5, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.apartment.tower', version: 1, component: 'ApartmentTower', category: 'building',
    description: 'Point apartment tower with corner balconies and a crown; landmark silhouette for compounds.',
    districts: ['residential', 'office'], placement: 'ground',
    params: { floors: { type: 'int', min: 6, max: 9, default: 9, description: 'Floors (≤ 30 m)' }, size: { type: 'number', min: 12, max: 18, default: 16, description: 'Square plan size' }, crown: { type: 'enum', values: ['flat', 'pavilion', 'spire'], default: 'pavilion', description: 'Roof crown style' }, tint },
    footprint: (p) => { const g = apartmentTower(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => ({ solids: residentialSolids['bld.apartment.tower'](p), walkable: [] }),
    sockets: (p) => { const g = apartmentTower(p); return [socket('lobby.door', 'door', 0, 0, g.d / 2), socket('lobby.sign', 'sign', 0, 3.2, g.d / 2)]; },
    clearance: { front: 4, side: 3 }, capabilities: [], lod: { levels: 3, cullDistance: 300 }, cost: { triangles: 1500, drawCalls: 6, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.apartment.compound-gate', version: 1, component: 'CompoundGate', category: 'building',
    description: 'Residential compound (小区) entrance: guard booth, gate post and lift barrier over a walkable driveway.',
    districts: ['residential'], placement: 'ground',
    params: { opening: { type: 'number', min: 5, max: 10, default: 7, description: 'Walkable driveway width' }, booth: { type: 'enum', values: ['left', 'right'], default: 'left', description: 'Guard booth side' }, name: { type: 'text', catalog: 'notice', default: 'entrance', description: 'Booth sign key' } },
    footprint: (p) => { const g = compoundGate(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => {
      const g = compoundGate(p), centre = g.side === 'left' ? (g.booth - g.post) / 2 : (g.post - g.booth) / 2;
      return { solids: residentialSolids['bld.apartment.compound-gate'](p), walkable: [box(centre, 0, g.opening, g.d)] };
    },
    sockets: (p) => { const g = compoundGate(p), x = g.side === 'left' ? -g.w / 2 + g.booth / 2 : g.w / 2 - g.booth / 2; return [socket('booth.sign', 'sign', x, 2.7, g.d / 2), socket('booth.lamp', 'lamp', x, 3.4, g.d / 2)]; },
    clearance: { front: 4, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 100 }, cost: { triangles: 400, drawCalls: 6, instanced: false }, review: 'approved',
  },
  {
    id: 'bld.residential.wall', version: 1, component: 'CompoundWall', category: 'building',
    description: 'Compound boundary wall segment: grey brick, iron railing on a plinth, or lattice-window wall.',
    districts: ['residential', 'historic', 'park'], placement: 'ground',
    params: { length: { type: 'number', min: 4, max: 20, default: 12, description: 'Segment length' }, height: { type: 'number', min: 1.8, max: 3, default: 2.2, description: 'Wall height' }, style: { type: 'enum', values: ['brick', 'railing', 'lattice'], default: 'brick', description: 'Wall style' } },
    footprint: (p) => { const g = compoundWall(p); return { w: g.w, d: g.d, h: g.h }; },
    collision: (p) => ({ solids: residentialSolids['bld.residential.wall'](p), walkable: [] }),
    sockets: (p) => { const g = compoundWall(p); return [socket('lamp', 'lamp', 0, g.height, 0.25)]; },
    clearance: { front: 1, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 90 }, cost: { triangles: 120, drawCalls: 2, instanced: true }, review: 'approved',
  },
];
