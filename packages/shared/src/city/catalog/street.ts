import type { CatalogEntry, CollisionShape, ParamSpec, ParamValues, Placement, Rect, Road, Socket } from '../contracts.js';

// Street infrastructure: walkable road/sidewalk tiles plus solid street furniture.
// Geometry functions are shared by the renderer (apps/web/src/city/assets/street.tsx) and collision.

const ALL = ['shopping', 'historic', 'residential', 'office', 'waterfront', 'park', 'industrial'] as const;
const n = (p: ParamValues, key: string) => p[key] as number;
const rect = (w: number, d: number, x = 0, z = 0): Rect => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
const num = (min: number, max: number, def: number, description: string): ParamSpec => ({ type: 'number', min, max, default: def, description });
const int = (min: number, max: number, def: number, description: string): ParamSpec => ({ type: 'int', min, max, default: def, description });
const pick = (values: string[], description: string): ParamSpec => ({ type: 'enum', values, default: values[0]!, description });
const none: Socket[] = [];

type Spec = Omit<CatalogEntry, 'version' | 'category' | 'review' | 'sockets' | 'collision'> & {
  sockets?: CatalogEntry['sockets'];
  /** Ground tiles are fully walkable; props are solid over the given rects (default: whole footprint). */
  walkable?: boolean;
  solids?: (p: ParamValues) => Rect[];
};
const entry = ({ walkable, solids, sockets, ...spec }: Spec): CatalogEntry => ({
  ...spec, version: 1, category: 'street', review: 'approved',
  sockets: sockets ?? (() => none),
  collision: (p): CollisionShape => {
    const { w, d } = spec.footprint(p);
    return walkable ? { solids: solids?.(p) ?? [], walkable: [rect(w, d)] } : { solids: solids?.(p) ?? [rect(w, d)], walkable: [] };
  },
});

export const streetEntries: readonly CatalogEntry[] = [
  entry({
    id: 'st.road.straight', component: 'RoadStraight', description: 'Asphalt road tile; length runs along local z. Walkable, flat.',
    districts: ALL, placement: 'road', walkable: true,
    params: { length: num(1, 40, 8, 'Tile length along the road (m)'), width: num(2, 16, 8, 'Carriageway width (m)'), markings: pick(['center', 'double-yellow', 'none'], 'Lane markings') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'length'), h: 0.02 }),
    clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 120 }, cost: { triangles: 24, drawCalls: 2, instanced: true },
  }),
  entry({
    id: 'st.road.intersection', component: 'RoadIntersection', description: 'Square junction tile with stop lines on the open arms.',
    districts: ALL, placement: 'road', walkable: true,
    params: { size: num(4, 16, 10, 'Junction side length (m)'), arms: pick(['four', 'tee'], 'Four-way or T junction (tee closes local -z)') },
    footprint: (p) => ({ w: n(p, 'size'), d: n(p, 'size'), h: 0.02 }),
    clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 120 }, cost: { triangles: 40, drawCalls: 2, instanced: false },
  }),
  entry({
    id: 'st.crossing.zebra', component: 'ZebraCrossing', description: 'Zebra crossing painted across a road; stripes run along local z.',
    districts: ALL, placement: 'road', walkable: true,
    params: { width: num(2, 16, 8, 'Road width spanned (m)'), depth: num(2, 5, 3, 'Crossing depth (m)') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: 0.03 }),
    clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 80 }, cost: { triangles: 96, drawCalls: 1, instanced: true },
  }),
  entry({
    id: 'st.sidewalk', component: 'Sidewalk', description: 'Raised-look pavement strip with kerb; walkable.',
    districts: ALL, placement: 'sidewalk', walkable: true,
    params: { length: num(1, 40, 8, 'Strip length along local z (m)'), width: num(1.5, 6, 3, 'Strip width (m)'), paving: pick(['concrete', 'brick', 'granite'], 'Paving material') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'length'), h: 0.12 }),
    clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 100 }, cost: { triangles: 36, drawCalls: 2, instanced: true },
  }),
  entry({
    id: 'st.lane.paved', component: 'PavedLane', description: 'Narrow stone-paved longtang lane with a centre drain gutter.',
    districts: ['historic', 'residential', 'shopping'], placement: 'road', walkable: true,
    params: { length: num(1, 40, 10, 'Lane length along local z (m)'), width: num(2, 6, 3.5, 'Lane width (m)'), stone: pick(['grey', 'red-brick'], 'Paving stone') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'length'), h: 0.03 }),
    clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 90 }, cost: { triangles: 60, drawCalls: 2, instanced: true },
  }),
  entry({
    id: 'st.metro.entrance', component: 'MetroEntrance', description: 'Metro stair entrance with 地铁 sign; stairs face local +z. Solid (no level change).',
    districts: ['shopping', 'office', 'residential', 'historic', 'waterfront'], placement: 'sidewalk',
    params: { variant: pick(['canopy', 'glass-box'], 'Open canopy or enclosed glass box'), sign: { type: 'text', catalog: 'landmark', default: 'metro', description: 'Landmark text on the totem' } },
    footprint: (p) => ({ w: 3.4, d: 6, h: p.variant === 'glass-box' ? 3.2 : 2.8 }),
    sockets: () => [{ id: 'totem', kind: 'sign', x: 1.9, y: 2.2, z: 2.6, facing: 0 }],
    clearance: { front: 2, side: 0.5 }, capabilities: [], lod: { levels: 2, cullDistance: 120 }, cost: { triangles: 420, drawCalls: 7, instanced: false },
  }),
  entry({
    id: 'st.lamp.modern', component: 'LampModern', description: 'Steel street lamp; single or double arm.',
    districts: ALL, placement: 'sidewalk', solids: () => [rect(0.3, 0.3)],
    params: { height: num(4, 7, 5, 'Pole height (m)'), arms: pick(['single', 'double'], 'Arm count') },
    footprint: (p) => ({ w: p.arms === 'double' ? 2.4 : 1.4, d: 0.3, h: n(p, 'height') }),
    clearance: { front: 0.5, side: 0.5 }, capabilities: [], lod: { levels: 2, cullDistance: 90 }, cost: { triangles: 90, drawCalls: 3, instanced: true },
  }),
  entry({
    id: 'st.lamp.lantern-post', component: 'LanternPost', description: 'Ink post with hanging red lanterns (old-town style).',
    districts: ['historic', 'shopping', 'park', 'waterfront'], placement: 'sidewalk', solids: () => [rect(0.3, 0.3)],
    params: { height: num(2.5, 4, 3.2, 'Post height (m)'), lanterns: int(1, 2, 2, 'Lanterns hung from the crossbar') },
    footprint: (p) => ({ w: 1.6, d: 0.3, h: n(p, 'height') }),
    clearance: { front: 0.5, side: 0.5 }, capabilities: [], lod: { levels: 2, cullDistance: 80 }, cost: { triangles: 260, drawCalls: 8, instanced: false },
  }),
  entry({
    id: 'st.bench', component: 'Bench', description: 'Street bench facing local +z.',
    districts: ALL, placement: 'sidewalk',
    params: { length: num(1.2, 2.4, 1.8, 'Bench length (m)'), variant: pick(['wood', 'stone'], 'Slatted wood or stone slab') },
    footprint: (p) => ({ w: n(p, 'length'), d: 0.6, h: p.variant === 'wood' ? 0.9 : 0.45 }),
    clearance: { front: 0.8, side: 0.3 }, capabilities: [], lod: { levels: 1, cullDistance: 60 }, cost: { triangles: 72, drawCalls: 2, instanced: true },
  }),
  entry({
    id: 'st.bollard', component: 'BollardRow', description: 'Row of short bollards along local x; gaps between posts are walkable.',
    districts: ALL, placement: 'sidewalk',
    params: { count: int(1, 6, 3, 'Number of bollards'), spacing: num(1.2, 2, 1.4, 'Centre spacing (m), gaps stay passable') },
    footprint: (p) => ({ w: (n(p, 'count') - 1) * n(p, 'spacing') + 0.3, d: 0.3, h: 0.8 }),
    solids: (p) => Array.from({ length: n(p, 'count') }, (_, i) => rect(0.3, 0.3, (i - (n(p, 'count') - 1) / 2) * n(p, 'spacing'))),
    clearance: { front: 0.3, side: 0.3 }, capabilities: [], lod: { levels: 1, cullDistance: 50 }, cost: { triangles: 40, drawCalls: 1, instanced: true },
  }),
  entry({
    id: 'st.bikerack', component: 'BikeRack', description: 'Empty hoop bike rack along local x.',
    districts: ALL, placement: 'sidewalk',
    params: { slots: int(2, 8, 4, 'Hoops') },
    footprint: (p) => ({ w: n(p, 'slots') * 0.8, d: 0.6, h: 0.8 }),
    clearance: { front: 1.5, side: 0.3 }, capabilities: [], lod: { levels: 1, cullDistance: 50 }, cost: { triangles: 60, drawCalls: 1, instanced: true },
  }),
  entry({
    id: 'st.sharedbikes', component: 'SharedBikes', description: 'Parked row of dockless share bikes, angled to the kerb.',
    districts: ['shopping', 'office', 'residential', 'historic', 'waterfront'], placement: 'sidewalk',
    params: { count: int(2, 10, 5, 'Bikes in the row'), fleet: pick(['yellow', 'blue', 'green'], 'Operator livery') },
    footprint: (p) => ({ w: n(p, 'count') * 0.65 + 0.4, d: 1.7, h: 1.1 }),
    clearance: { front: 0.5, side: 0.3 }, capabilities: [], lod: { levels: 2, cullDistance: 60 }, cost: { triangles: 140, drawCalls: 3, instanced: true },
  }),
  entry({
    id: 'st.trashbin', component: 'TrashBin', description: 'Sorting bins (Shanghai waste classification) or a single bin.',
    districts: ALL, placement: 'sidewalk',
    params: { variant: pick(['sorting', 'single'], 'Four sorting bins or one bin') },
    footprint: (p) => ({ w: p.variant === 'sorting' ? 2 : 0.5, d: 0.5, h: 1 }),
    clearance: { front: 0.5, side: 0.2 }, capabilities: [], lod: { levels: 1, cullDistance: 50 }, cost: { triangles: 48, drawCalls: 2, instanced: true },
  }),
  entry({
    id: 'st.busstop', component: 'BusStop', description: 'Bus shelter with back panel, bench, and road-name board; open front (+z) is walkable.',
    districts: ['shopping', 'office', 'residential', 'historic', 'waterfront'], placement: 'sidewalk',
    params: { length: num(3, 6, 4, 'Shelter length (m)'), road: { type: 'text', catalog: 'road-name', default: 'nanjing', description: 'Stop name' } },
    footprint: (p) => ({ w: n(p, 'length'), d: 1.6, h: 2.6 }),
    // Back panel and bench are solid; the shelter's front half stays open to walk under.
    solids: (p) => [rect(n(p, 'length'), 0.25, 0, -0.675), rect(n(p, 'length') * 0.6, 0.45, 0, -0.33)],
    sockets: (p) => [{ id: 'board', kind: 'sign', x: n(p, 'length') / 2, y: 2.3, z: 0.6, facing: 0 }],
    clearance: { front: 1, side: 0.5 }, capabilities: [], lod: { levels: 2, cullDistance: 80 }, cost: { triangles: 180, drawCalls: 5, instanced: false },
  }),
  entry({
    id: 'st.streetsign', component: 'StreetSign', description: 'Blue road-name blade sign on a pole.',
    districts: ALL, placement: 'sidewalk', solids: () => [rect(0.2, 0.2)],
    params: { road: { type: 'text', catalog: 'road-name', default: 'nanjing', description: 'Road name shown' }, arrow: pick(['none', 'left', 'right'], 'Direction arrow') },
    footprint: () => ({ w: 1.4, d: 0.2, h: 2.8 }),
    clearance: { front: 0.3, side: 0.3 }, capabilities: [], lod: { levels: 1, cullDistance: 50 }, cost: { triangles: 36, drawCalls: 3, instanced: false },
  }),
  entry({
    id: 'st.loading-bay', component: 'LoadingBay', description: 'Hatched service loading bay with pallet stack at the back (-z).',
    districts: ['industrial', 'shopping', 'office'], placement: 'ground', walkable: true,
    params: { width: num(3, 8, 5, 'Bay width (m)'), depth: num(3, 6, 4, 'Bay depth (m)'), pallets: int(0, 3, 2, 'Pallet stacks along the back') },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'depth'), h: 0.03 }),
    solids: (p) => Array.from({ length: n(p, 'pallets') }, (_, i) => rect(1.1, 1.1, (i - (n(p, 'pallets') - 1) / 2) * 1.5, -n(p, 'depth') / 2 + 0.7)),
    clearance: { front: 1, side: 0.3 }, capabilities: [], lod: { levels: 1, cullDistance: 60 }, cost: { triangles: 80, drawCalls: 3, instanced: false },
  }),
];

/**
 * One tile placement per axis-aligned Road segment (chunk-local). Tile length runs along local z,
 * so x-axis roads rotate 90°. Promenades are left to the waterfront kit (wf.promenade).
 */
export function roadTiles(road: Road): Omit<Placement, 'id'>[] {
  const length = Math.abs(road.to.x - road.from.x) + Math.abs(road.to.z - road.from.z);
  if (length === 0 || road.kind === 'promenade') return [];
  const lane = road.kind === 'lane' && road.width <= 6;
  return [{
    assetId: lane ? 'st.lane.paved' : 'st.road.straight',
    params: lane ? { length, width: road.width } : { length, width: road.width, markings: road.kind === 'avenue' ? 'double-yellow' : 'center' },
    x: (road.from.x + road.to.x) / 2, z: (road.from.z + road.to.z) / 2,
    rotation: road.from.x === road.to.x ? 0 : 90,
  }];
}
