import type { CatalogEntry, CollisionShape, ParamSpec, ParamValues, Socket } from '../contracts.js';

// Storefront modules attach to building façade sockets. Entry-local origin: footprint centre on
// the socket point, +z out of the façade. Only the takeaway counter blocks movement.
// Awnings and signs use elevated sockets; storefront and window origins can be at ground level.
const n = (params: ParamValues, key: string) => params[key] as number;
const none: CollisionShape = { solids: [], walkable: [] };
const noSockets = (): readonly Socket[] => [];
const num = (min: number, max: number, def: number, description: string): ParamSpec => ({ type: 'number', min, max, default: def, description });
const choice = (values: string[], def: string, description: string): ParamSpec => ({ type: 'enum', values, default: def, description });
const shopping = ['shopping', 'historic', 'residential', 'office', 'waterfront'] as const;

type Spec = Omit<CatalogEntry, 'version' | 'category' | 'placement' | 'review' | 'collision' | 'sockets' | 'clearance' | 'capabilities' | 'lod' | 'cost'>
  & Partial<Pick<CatalogEntry, 'collision' | 'sockets' | 'clearance' | 'lod'>> & { triangles: number; instanced?: boolean };
const entry = ({ triangles, instanced = false, ...spec }: Spec): CatalogEntry => ({
  version: 1, category: 'storefront', placement: 'socket', review: 'approved', capabilities: [],
  collision: () => none, sockets: noSockets, clearance: { front: 0, side: 0 }, lod: { levels: 2, cullDistance: 70 },
  cost: { triangles, drawCalls: 2, instanced }, ...spec,
});

export const storefrontEntries: readonly CatalogEntry[] = [
  entry({ id: 'sf.door.wood', component: 'WoodDoor', description: 'Timber door: single leaf, double leaf, or a shikumen stone-framed lane-house door with black leaves.', districts: ['historic', 'residential', 'shopping'], attachesTo: ['door', 'storefront'],
    params: { variant: choice(['single', 'double', 'shikumen'], 'single', 'Door style'), width: num(0.9, 1.8, 1, 'Opening width (m)') },
    footprint: (p) => ({ w: n(p, 'width') + (p.variant === 'shikumen' ? 0.6 : 0.2), d: 0.2, h: p.variant === 'shikumen' ? 3 : 2.3 }), clearance: { front: 1, side: 0 }, triangles: 200 }),
  entry({ id: 'sf.door.glass', component: 'GlassDoor', description: 'Modern glass shop door with a metal frame and push bar.', districts: shopping, attachesTo: ['door', 'storefront'],
    params: { width: num(0.9, 2.4, 1.2, 'Opening width (m)'), frame: choice(['black', 'brass', 'white'], 'black', 'Frame finish') },
    footprint: (p) => ({ w: n(p, 'width') + 0.1, d: 0.1, h: 2.4 }), clearance: { front: 1, side: 0 }, triangles: 120 }),
  entry({ id: 'sf.window.shop', component: 'ShopWindow', description: 'Large display window with mullions and a low stall-riser.', districts: shopping, attachesTo: ['window', 'storefront'],
    params: { width: num(1.2, 4, 2.4, 'Window width (m)'), height: num(1.2, 2.4, 1.8, 'Glass height (m)'), mullions: { type: 'int', min: 0, max: 4, default: 2, description: 'Vertical glazing bars' } },
    footprint: (p) => ({ w: n(p, 'width'), d: 0.12, h: n(p, 'height') + 0.5 }), triangles: 150 }),
  entry({ id: 'sf.window.lattice', component: 'LatticeWindow', description: 'Traditional timber lattice window: grid, diamond, or ice-crack pattern.', districts: ['historic', 'residential'], attachesTo: ['window'],
    params: { width: num(0.8, 2, 1.2, 'Window width (m)'), pattern: choice(['grid', 'diamond', 'ice-crack'], 'grid', 'Lattice pattern') },
    footprint: (p) => ({ w: n(p, 'width'), d: 0.1, h: 1.3 }), triangles: 400 }),
  entry({ id: 'sf.awning.striped', component: 'StripedAwning', description: 'Sloped striped fabric awning over a shopfront.', districts: ['shopping', 'historic', 'waterfront'], attachesTo: ['awning'],
    params: { width: num(1.5, 6, 3, 'Awning width (m)'), depth: num(0.6, 1.6, 1, 'Projection (m)'), stripes: choice(['red', 'green', 'blue', 'yellow'], 'red', 'Stripe colour') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: 0.6 }), triangles: 160 }),
  entry({ id: 'sf.awning.canopy', component: 'FlatCanopy', description: 'Flat metal-and-glass canopy on two tie rods, for modern shops and offices.', districts: ['shopping', 'office', 'residential'], attachesTo: ['awning'],
    params: { width: num(1.5, 8, 3.5, 'Canopy width (m)'), depth: num(0.8, 2.2, 1.4, 'Projection (m)'), finish: choice(['steel', 'teal', 'wood'], 'steel', 'Canopy finish') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: 0.3 }), triangles: 80 }),
  entry({ id: 'sf.counter.takeaway', component: 'TakeawayCounter', description: 'Street-facing takeaway counter that projects onto the pavement; a server stands behind it (npc socket).', districts: ['shopping', 'historic', 'waterfront', 'park'], attachesTo: ['counter', 'storefront'],
    params: { width: num(1, 3, 1.8, 'Counter width (m)'), depth: num(0.5, 0.9, 0.6, 'Counter depth (m)'), top: choice(['steel', 'wood', 'tile'], 'wood', 'Worktop material') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: 1.05 }),
    collision: (p) => ({ solids: [{ minX: -n(p, 'width') / 2, maxX: n(p, 'width') / 2, minZ: -n(p, 'depth') / 2, maxZ: n(p, 'depth') / 2 }], walkable: [] }),
    sockets: (p) => [{ id: 'server', kind: 'npc', x: 0, y: 0, z: -n(p, 'depth') / 2 - 0.4, facing: 0 }],
    clearance: { front: 1.2, side: 0.3 }, triangles: 100 }),
  entry({ id: 'sf.sign.vertical', component: 'VerticalSign', description: 'Tall vertical blade sign projecting from the façade, reviewed shop name read top to bottom.', districts: ['shopping', 'historic'], attachesTo: ['sign'],
    params: { label: { type: 'text', catalog: 'shop-name', default: 'noodles', description: 'Reviewed shop name' }, height: num(1.2, 3, 2, 'Board height (m)'), color: choice(['red', 'gold', 'black', 'green'], 'red', 'Board colour') },
    footprint: (p) => ({ w: 0.12, d: 0.6, h: n(p, 'height') }), triangles: 40 }),
  entry({ id: 'sf.sign.horizontal', component: 'HorizontalSign', description: 'Fascia board above a shopfront with the reviewed shop name.', districts: shopping, attachesTo: ['sign'],
    params: { label: { type: 'text', catalog: 'shop-name', default: 'cafe', description: 'Reviewed shop name' }, width: num(1.5, 5, 3, 'Board width (m)'), color: choice(['red', 'gold', 'black', 'green', 'cream'], 'black', 'Board colour') },
    footprint: (p) => ({ w: n(p, 'width'), d: 0.12, h: 0.7 }), triangles: 40 }),
  entry({ id: 'sf.sign.neon', component: 'NeonSign', description: 'Glowing neon-tube notice (营业中, 欢迎光临 …) mounted on a dark backplate.', districts: ['shopping', 'waterfront', 'office'], attachesTo: ['sign'],
    params: { label: { type: 'text', catalog: 'notice', default: 'open', description: 'Reviewed notice' }, color: choice(['pink', 'cyan', 'amber', 'lime'], 'pink', 'Tube colour'), flicker: { type: 'boolean', default: false, description: 'Gentle flicker (off under reduced motion)' } },
    footprint: () => ({ w: 1.4, d: 0.08, h: 0.5 }), triangles: 30 }),
  entry({ id: 'sf.shutter.rolling', component: 'RollingShutter', description: 'Corrugated roller shutter, partly or fully drawn, for closed shops and loading fronts.', districts: ['shopping', 'industrial', 'residential'], attachesTo: ['door', 'storefront'],
    params: { width: num(1.2, 4, 2.4, 'Shutter width (m)'), open: num(0, 1, 0.3, 'Fraction raised'), color: choice(['silver', 'green', 'blue'], 'silver', 'Slat colour') },
    footprint: (p) => ({ w: n(p, 'width'), d: 0.2, h: 2.6 }), triangles: 80 }),
  entry({ id: 'sf.lantern.pair', component: 'LanternPair', description: 'Two hanging lanterns flanking an entrance on short brackets.', districts: ['historic', 'shopping', 'park'], attachesTo: ['door', 'storefront', 'awning'],
    params: { spacing: num(1.2, 3.5, 2, 'Distance between lanterns (m)'), color: choice(['red', 'gold'], 'red', 'Lantern colour'), tassels: { type: 'boolean', default: true, description: 'Hanging tassels' } },
    footprint: (p) => ({ w: n(p, 'spacing') + 0.6, d: 0.6, h: 0.9 }), triangles: 300, instanced: true }),
];
