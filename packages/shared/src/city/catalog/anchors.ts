import type { CatalogEntry, CollisionShape, ParamValues, Rect, Socket } from '../contracts.js';

// Interaction anchors: the only entries an Anchor may bind to (contracts.ts AnchorSchema).
// Decorative signage lives in storefront.ts; these carry gameplay capabilities.
// Local space: origin at footprint centre on the ground, +z is the front (player side).

const box = (w: number, d: number, cx = 0, cz = 0): Rect => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
const solid = (...solids: Rect[]): CollisionShape => ({ solids, walkable: [] });
const socket = (id: string, kind: Socket['kind'], x: number, y: number, z: number, facing: Socket['facing'] = 0): Socket => ({ id, kind, x, y, z, facing });
const num = (p: ParamValues, key: string, fallback: number) => (typeof p[key] === 'number' ? p[key] : fallback);

const HOTEL = { w: 24, d: 16, storeyHeight: 3.2, podium: 4.5 } as const;
const hotelHeight = (p: ParamValues) => HOTEL.podium + num(p, 'floors', 8) * HOTEL.storeyHeight + 3;
const NPC_SIZE = { w: 0.8, d: 0.8, h: 1.8 } as const;
const npcSolid = solid(box(0.6, 0.6));

const npc = (role: 'vendor' | 'guide' | 'passerby', capability: CatalogEntry['capabilities'], description: string, nameKey: string): CatalogEntry => ({
  id: `an.npc.${role}`, version: 1, component: 'NpcFigure', category: 'anchor', description,
  districts: ['shopping', 'historic', 'residential', 'office', 'waterfront', 'park', 'industrial'],
  params: {
    nameKey: { type: 'text', catalog: 'npc-name', default: nameKey, description: 'Reviewed display name.' },
    outfit: { type: 'enum', values: ['casual', 'smart', 'apron'], default: role === 'vendor' ? 'apron' : role === 'guide' ? 'smart' : 'casual', description: 'Clothing palette.' },
  },
  // Vendors stand in a counter's npc socket; the counter is the solid, so the figure adds none.
  placement: role === 'vendor' ? 'socket' : 'sidewalk', ...(role === 'vendor' ? { attachesTo: ['npc'] as const } : {}),
  footprint: () => ({ ...NPC_SIZE }),
  collision: () => (role === 'vendor' ? solid() : npcSolid),
  sockets: () => [],
  clearance: { front: 1.2, side: 0.4 }, capabilities: capability,
  lod: { levels: 2, cullDistance: 60 }, cost: { triangles: 2_400, drawCalls: 14, instanced: false }, review: 'approved',
});

export const anchorsEntries: readonly CatalogEntry[] = [
  {
    id: 'an.vendor.cafe-counter', version: 1, component: 'CafeCounter', category: 'anchor',
    description: 'Open-front café counter booth with tiled roof and lanterns; a vendor serves drinks across the counter.',
    districts: ['shopping', 'historic', 'waterfront', 'park'],
    params: {
      style: { type: 'enum', values: ['teahouse', 'modern'], default: 'teahouse', description: 'Tiled roof and lanterns, or flat canopy and glass.' },
      nameKey: { type: 'text', catalog: 'shop-name', default: 'cafe', description: 'Shop name board.' },
      width: { type: 'number', min: 3, max: 5, default: 4, step: 0.5, description: 'Counter frontage in metres.' },
    },
    placement: 'sidewalk',
    footprint: (p) => ({ w: num(p, 'width', 4), d: 2.5, h: 3 }),
    collision: (p) => solid(box(num(p, 'width', 4), 2.5)),
    sockets: () => [socket('npc', 'npc', 0, 0, -0.5), socket('menu', 'sign', 0, 2.2, 1.26)],
    clearance: { front: 1.6, side: 0.3 }, capabilities: ['drink-vendor'],
    lod: { levels: 2, cullDistance: 90 }, cost: { triangles: 1_800, drawCalls: 16, instanced: false }, review: 'approved',
  },
  {
    id: 'an.vendor.drink-stall', version: 1, component: 'DrinkStall', category: 'anchor',
    description: 'Wheeled street drink cart with cooler and optional umbrella.',
    districts: ['shopping', 'historic', 'waterfront', 'park', 'office'],
    params: {
      umbrella: { type: 'boolean', default: true, description: 'Striped umbrella over the cart.' },
      nameKey: { type: 'text', catalog: 'shop-name', default: 'drinks', description: 'Cart banner.' },
    },
    placement: 'sidewalk',
    footprint: () => ({ w: 2.2, d: 1.4, h: 2.6 }),
    collision: () => solid(box(2.2, 1.4)),
    sockets: () => [socket('npc', 'npc', 0, 0, -1.1)],
    clearance: { front: 1.4, side: 0.4 }, capabilities: ['drink-vendor'],
    lod: { levels: 2, cullDistance: 70 }, cost: { triangles: 900, drawCalls: 10, instanced: false }, review: 'approved',
  },
  {
    id: 'an.vendor.convenience', version: 1, component: 'ConvenienceShop', category: 'anchor',
    description: 'Single-storey convenience store with glass front, fascia band and a takeaway window counter.',
    districts: ['shopping', 'residential', 'office', 'historic', 'industrial'],
    params: {
      fascia: { type: 'enum', values: ['blue', 'green', 'orange'], default: 'blue', description: 'Chain fascia colour band.' },
      nameKey: { type: 'text', catalog: 'shop-name', default: 'convenience', description: 'Fascia name.' },
    },
    placement: 'ground',
    footprint: () => ({ w: 6, d: 5, h: 3.6 }),
    collision: () => solid(box(6, 5)),
    // The shop shell is solid: keep the vendor's entire body outside the front wall.
    sockets: () => [socket('npc', 'npc', 1.6, 0, 3.1), socket('sign', 'sign', 0, 3, 2.55)],
    clearance: { front: 1.8, side: 0 }, capabilities: ['drink-vendor'],
    lod: { levels: 2, cullDistance: 110 }, cost: { triangles: 1_200, drawCalls: 12, instanced: false }, review: 'approved',
  },
  {
    id: 'an.helper.info-board', version: 1, component: 'InfoBoard', category: 'anchor',
    description: 'Neighbourhood map board where a local guide waits to give directions.',
    districts: ['shopping', 'historic', 'residential', 'office', 'waterfront', 'park'],
    params: { style: { type: 'enum', values: ['map', 'kiosk'], default: 'map', description: 'Free-standing map or roofed info kiosk.' } },
    placement: 'sidewalk',
    footprint: (p) => (p.style === 'kiosk' ? { w: 2, d: 1.6, h: 2.8 } : { w: 1.6, d: 0.4, h: 2.2 }),
    collision: (p) => solid(p.style === 'kiosk' ? box(2, 1.6) : box(1.6, 0.4)),
    sockets: (p) => [socket('npc', 'npc', 1.4, 0, p.style === 'kiosk' ? 1.2 : 0.6)],
    clearance: { front: 1.4, side: 0.6 }, capabilities: ['direction-helper'],
    lod: { levels: 2, cullDistance: 70 }, cost: { triangles: 500, drawCalls: 8, instanced: false }, review: 'approved',
  },
  {
    id: 'an.hotel.grand', version: 1, component: 'GrandHotel', category: 'anchor',
    description: 'The unique Shanghai Grand Hotel (上海大酒店): stepped Art Deco tower on a stone podium with a lit entrance canopy and rooftop sign.',
    districts: ['shopping', 'office', 'waterfront', 'historic'],
    params: { floors: { type: 'int', min: 6, max: 12, default: 8, description: 'Tower storeys above the podium.' } },
    placement: 'ground',
    footprint: (p) => ({ w: HOTEL.w, d: HOTEL.d, h: hotelHeight(p) }),
    // The entrance canopy is cantilevered (no posts), so the forecourt stays walkable.
    collision: () => solid(box(HOTEL.w, HOTEL.d)),
    sockets: () => [socket('door', 'door', 0, 0, HOTEL.d / 2), socket('sign', 'sign', 0, 4, HOTEL.d / 2 + 0.05)],
    clearance: { front: 4, side: 1 }, capabilities: ['hotel-landmark'],
    lod: { levels: 3, cullDistance: 400 }, cost: { triangles: 6_000, drawCalls: 30, instanced: false }, review: 'approved',
  },
  {
    id: 'an.viewpoint.river', version: 1, component: 'RiverViewpoint', category: 'anchor',
    description: 'Riverside viewing deck with railing and a marked photo spot facing the Huangpu River (+z faces the water).',
    districts: ['waterfront', 'park'],
    params: {
      width: { type: 'number', min: 4, max: 8, default: 6, step: 1, description: 'Deck length along the bank.' },
      benches: { type: 'boolean', default: true, description: 'Benches at the deck ends.' },
    },
    placement: 'water-edge',
    footprint: (p) => ({ w: num(p, 'width', 6), d: 4, h: 1.2 }),
    // The deck is walkable even where it overhangs water; only the river-side railing blocks.
    collision: (p) => ({ solids: [box(num(p, 'width', 6), 0.2, 0, 1.9)], walkable: [box(num(p, 'width', 6), 3.8, 0, -0.1)] }),
    sockets: (p) => [socket('photo-spot', 'npc', 0, 0, 0.6, 180), socket('npc', 'npc', num(p, 'width', 6) / 2 - 0.8, 0, -1)],
    clearance: { front: 0, side: 0.5 }, capabilities: ['river-viewpoint'],
    lod: { levels: 2, cullDistance: 150 }, cost: { triangles: 1_000, drawCalls: 10, instanced: false }, review: 'approved',
  },
  npc('vendor', ['drink-vendor'], 'Drink vendor figure; stands in a counter npc socket.', 'laowang'),
  npc('guide', ['direction-helper'], 'Local resident who gives directions; stands on a sidewalk, often beside an info board.', 'xiaoli'),
  npc('passerby', ['photo-passerby'], 'Friendly passer-by who will take a photo for the player; strolls near viewpoints.', 'xiaomei'),
  {
    id: 'an.sign.menu', version: 1, component: 'MenuSign', category: 'anchor',
    description: 'Decorative A-frame menu board placed beside a vendor.',
    districts: ['shopping', 'historic', 'waterfront', 'park', 'office', 'residential'],
    params: { textKey: { type: 'text', catalog: 'menu', default: 'drinks', description: 'Reviewed menu text.' } },
    placement: 'sidewalk',
    footprint: () => ({ w: 0.8, d: 0.6, h: 1.2 }),
    collision: () => solid(box(0.8, 0.6)),
    sockets: () => [],
    clearance: { front: 1, side: 0.2 }, capabilities: ['readable-sign'],
    lod: { levels: 1, cullDistance: 40 }, cost: { triangles: 120, drawCalls: 3, instanced: false }, review: 'approved',
  },
];
