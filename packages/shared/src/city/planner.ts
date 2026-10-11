import type { Position } from '../contracts.js';
import {
  CHUNK_SIZE, DISTRICT_TARGETS, inSpawnBox,
  type Bridge, type ChunkCoord, type ChunkPlan, type Connector, type DistrictKind, type Edge, type Road, type Water,
} from './contracts.js';
import { createRng, hashString } from './rng.js';

// Seeded regional planner (CITY_GENERATION §3, §7, §8). Everything here is a pure function of
// (seed, coord), so neighbours derive identical shared edges regardless of generation order.
// Conventions match validate.ts: north edge z = 0 (neighbour cz−1), south z = 40, west x = 0, east x = 40.
// Avenues run on even columns/rows, streets on odd ones; N-S roads are named after provinces and
// E-W roads after cities, as in central Shanghai. The Huangpu is a straight N-S corridor with
// promenades on both banks; creeks run E-W into it west of the river. All values are tunable.

export const ROAD_WIDTH = { avenue: 5, street: 3.5, lane: 1.5, promenade: 3 } as const;
/** Sidewalk strip kept clear of buildings on each side of every road and creek. */
export const SIDEWALK = 2.5;
const CREEK = { half: 4 } as const;
const RIVER = { axis: 'z' as const, center: 160, width: 30 };
const LINE_OFFSETS = [8, 14, 20, 26, 32] as const;
/** Lines through the hotel chunk leave one 24.5 m quadrant for the hotel. */
const HOTEL_LINE = 8;
const SPAWN_LINE = 14;
const STREET_CROSSING = 0.8;
const PROVINCES = ['sichuan', 'henan', 'shanxi', 'zhejiang', 'xizang', 'yunnan'] as const;
const CITIES = ['nanjing', 'jiujiang', 'hankou', 'fuzhou', 'yanan', 'huaihai', 'wuding'] as const;
const HOTEL_CANDIDATES = [[2, 2], [2, -2], [-2, 2], [-2, -2], [0, 2], [0, -2], [2, 0], [-2, 0]] as const;

const mod = (n: number, m: number) => ((n % m) + m) % m;
const unit = (seed: string, ...salt: (string | number)[]) => createRng(seed, ...salt)();

export type WorldLayout = {
  spawn: Position;
  hotel: { coord: ChunkCoord; anchorId: 'hotel.grand'; local: { x: number; z: number } };
  river: { axis: 'x' | 'z'; center: number; width: number };
  creekRows: number[];
};
/** A plan plus the deterministic level bridges where its roads cross water (needed for connectivity). */
/** Alias kept for callers; ChunkPlan now carries planner bridges. */
export type PlannedChunk = ChunkPlan;

const riverSpan = () => ({ min: RIVER.center - RIVER.width / 2, max: RIVER.center + RIVER.width / 2 });
const westBankCol = () => Math.floor(riverSpan().min / CHUNK_SIZE);
const eastBankCol = () => Math.floor((riverSpan().max - 1e-9) / CHUNK_SIZE);
const isRiverCol = (cx: number) => cx === westBankCol() || cx === eastBankCol();
/** Vertical chunk edge at x = cx·40 lies inside the river. */
const edgeInRiver = (cx: number) => cx * CHUNK_SIZE > riverSpan().min && cx * CHUNK_SIZE < riverSpan().max;

const layouts = new Map<string, WorldLayout>();
export function worldLayout(seed: string): WorldLayout {
  const cached = layouts.get(seed);
  if (cached) return cached;
  const h = hashString(`${seed}|layout`);
  const [hx, hz] = HOTEL_CANDIDATES[h % HOTEL_CANDIDATES.length]!;
  const creekRows = [-3 - (h & 1), 3 + ((h >> 1) & 1)];
  const lot = HOTEL_LINE + ROAD_WIDTH.avenue / 2 + SIDEWALK;
  const hotel = { coord: { cx: hx, cz: hz }, anchorId: 'hotel.grand' as const, local: { x: lot + (CHUNK_SIZE - lot) / 2, z: lot - SIDEWALK / 2 } };
  const layout: WorldLayout = { spawn: { x: 0, z: 0 }, hotel, river: { ...RIVER }, creekRows };
  const ox = colLine(seed, 0, layout), oz = rowLine(seed, 0, layout);
  layout.spawn = { x: ox + ROAD_WIDTH.avenue / 2 + SIDEWALK / 2, z: oz + ROAD_WIDTH.avenue / 2 + SIDEWALK / 2 };
  if (layouts.size > 64) layouts.clear();
  layouts.set(seed, layout);
  return layout;
}

type LineKind = 'avenue' | 'street' | 'promenade';
function colKind(cx: number): LineKind { return isRiverCol(cx) ? 'promenade' : mod(cx, 2) === 0 ? 'avenue' : 'street'; }
function colLine(seed: string, cx: number, layout = worldLayout(seed)): number {
  if (cx === westBankCol()) return riverSpan().min - cx * CHUNK_SIZE - ROAD_WIDTH.promenade / 2;
  if (cx === eastBankCol()) return riverSpan().max - cx * CHUNK_SIZE + ROAD_WIDTH.promenade / 2;
  if (cx === layout.hotel.coord.cx) return HOTEL_LINE;
  if (cx === 0) return SPAWN_LINE;
  return LINE_OFFSETS[hashString(`${seed}|col|${cx}`) % LINE_OFFSETS.length]!;
}
const isCreekRow = (cz: number, layout: WorldLayout) => layout.creekRows.includes(cz);
function rowKind(cz: number): 'avenue' | 'street' { return mod(cz, 2) === 0 ? 'avenue' : 'street'; }
function rowLine(seed: string, cz: number, layout = worldLayout(seed)): number {
  if (isCreekRow(cz, layout)) return CHUNK_SIZE / 2;
  if (cz === layout.hotel.coord.cz) return HOTEL_LINE;
  if (cz === 0) return SPAWN_LINE;
  return LINE_OFFSETS[hashString(`${seed}|row|${cz}`) % LINE_OFFSETS.length]!;
}
const colName = (seed: string, cx: number) => cx === westBankCol() ? 'zhongshan' : cx === eastBankCol() ? 'binjiang' : PROVINCES[mod(cx + hashString(`${seed}|names`), PROVINCES.length)]!;
const rowName = (seed: string, cz: number) => CITIES[mod(cz + (hashString(`${seed}|names`) >> 3), CITIES.length)]!;

/** N-S road crosses the horizontal edge between rows cz−1 and cz in column cx. Identity is the edge itself. */
function crossesHorizontalEdge(seed: string, cx: number, cz: number): boolean {
  return colKind(cx) !== 'street' || unit(seed, 'h-edge', cx, cz) < STREET_CROSSING;
}
/** E-W road crosses the vertical edge between columns cx−1 and cx in row cz. */
function crossesVerticalEdge(seed: string, cx: number, cz: number, layout: WorldLayout): boolean {
  if (isCreekRow(cz, layout)) return false;
  if (edgeInRiver(cx)) return rowKind(cz) === 'avenue';
  return rowKind(cz) === 'avenue' || unit(seed, 'v-edge', cx, cz) < STREET_CROSSING;
}

// ---------------------------------------------------------------- districts

const LAND_KINDS = (['shopping', 'park'] as const);
// Keep parks as neighborhood breaks rather than several hundred metres of open land.
const CELL = 2;
function cellKind(seed: string, gx: number, gz: number): DistrictKind {
  const r = createRng(seed, 'cell', gx, gz);
  r(); r();
  const weights = LAND_KINDS.map((kind) => DISTRICT_TARGETS[kind]);
  let roll = r() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < LAND_KINDS.length; i++) { roll -= weights[i]!; if (roll <= 0) return LAND_KINDS[i]!; }
  return 'shopping';
}
/** Jittered Voronoi clusters give contiguous districts with gradual, irregular borders. */
function voronoi(seed: string, cx: number, cz: number): DistrictKind {
  const gx0 = Math.floor(cx / CELL), gz0 = Math.floor(cz / CELL);
  let best = Infinity, kind: DistrictKind = 'shopping';
  for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) for (let gz = gz0 - 1; gz <= gz0 + 1; gz++) {
    const r = createRng(seed, 'cell', gx, gz);
    const d = Math.hypot(gx * CELL + r() * CELL - (cx + 0.5), gz * CELL + r() * CELL - (cz + 0.5));
    if (d < best) { best = d; kind = cellKind(seed, gx, gz); }
  }
  return kind;
}
export function districtOf(seed: string, coord: ChunkCoord): DistrictKind {
  const { cx, cz } = coord;
  const layout = worldLayout(seed);
  if (cx >= westBankCol() - 1 && cx <= eastBankCol() + 1 && !inSpawnBox(coord)) return 'waterfront';
  if (cx === 0 && cz === 0) return 'shopping';
  const v = voronoi(seed, cx, cz);
  if (cx === layout.hotel.coord.cx && cz === layout.hotel.coord.cz) return 'shopping';
  if (inSpawnBox(coord)) return 'shopping';
  return v;
}

// ---------------------------------------------------------------- geometry

function connectorsFor(seed: string, coord: ChunkCoord, layout: WorldLayout): Connector[] {
  const { cx, cz } = coord;
  const out: Connector[] = [];
  const ck = colKind(cx), ox = colLine(seed, cx, layout);
  for (const [edge, ez] of [['north', cz], ['south', cz + 1]] as const) {
    if (crossesHorizontalEdge(seed, cx, ez)) out.push({ edge, kind: ck, offset: ox, width: ROAD_WIDTH[ck] });
    const water = riverInChunk(cx);
    if (water) out.push({ edge, kind: 'river', offset: (water.minX + water.maxX) / 2, width: water.maxX - water.minX });
  }
  const rk = rowKind(cz), oz = rowLine(seed, cz, layout);
  for (const [edge, ex] of [['west', cx], ['east', cx + 1]] as const) {
    if (crossesVerticalEdge(seed, ex, cz, layout)) out.push({ edge, kind: rk, offset: oz, width: ROAD_WIDTH[rk] });
    if (isCreekRow(cz, layout) && ex <= westBankCol()) out.push({ edge, kind: 'creek', offset: CHUNK_SIZE / 2, width: CREEK.half * 2 });
    if (edgeInRiver(ex)) out.push({ edge, kind: 'river', offset: CHUNK_SIZE / 2, width: CHUNK_SIZE });
  }
  return out;
}
function riverInChunk(cx: number): { minX: number; maxX: number } | null {
  const o = cx * CHUNK_SIZE, s = riverSpan();
  const minX = Math.max(s.min, o) - o, maxX = Math.min(s.max, o + CHUNK_SIZE) - o;
  return maxX > minX ? { minX, maxX } : null;
}
function waterFor(cx: number, cz: number, layout: WorldLayout): Water[] {
  const out: Water[] = [];
  const river = riverInChunk(cx);
  if (river) out.push({ id: 'river', kind: 'river', rect: { minX: river.minX, maxX: river.maxX, minZ: 0, maxZ: CHUNK_SIZE } });
  if (isCreekRow(cz, layout) && cx <= westBankCol()) {
    const maxX = Math.min(CHUNK_SIZE, riverSpan().min - cx * CHUNK_SIZE);
    out.push({ id: 'creek', kind: 'creek', rect: { minX: 0, maxX, minZ: CHUNK_SIZE / 2 - CREEK.half, maxZ: CHUNK_SIZE / 2 + CREEK.half } });
  }
  return out;
}

/**
 * Split a road interval [a, b] along its axis around water crossing its centre line. Gaps between
 * land, or reaching an edge the road continues across, become level bridges; dead-end tails into
 * water are dropped.
 */
function splitRoad(id: string, kind: Road['kind'], axis: 'x' | 'z', line: number, a: number, b: number, width: number, nameKey: string, water: Water[], roads: Road[], bridges: Bridge[]) {
  const gaps = water.map((w) => axis === 'z' ? (line > w.rect.minX && line < w.rect.maxX ? [w.rect.minZ, w.rect.maxZ] : null) : (line > w.rect.minZ && line < w.rect.maxZ ? [w.rect.minX, w.rect.maxX] : null))
    .filter((g): g is number[] => g !== null && g[1]! > a && g[0]! < b).sort((p, q) => p[0]! - q[0]!);
  let cursor = a, piece = 0;
  const seg = (from: number, to: number) => {
    if (to - from < 0.5) return;
    const p = (v: number) => axis === 'z' ? { x: line, z: v } : { x: v, z: line };
    roads.push({ id: piece++ ? `${id}-${piece}` : id, kind, from: p(from), to: p(to), width, nameKey });
  };
  for (const [g0, g1] of gaps as [number, number][]) {
    const lo = Math.max(g0, a), hi = Math.min(g1, b);
    seg(cursor, lo);
    const continues = hi < b || b === CHUNK_SIZE, began = lo > a || a === 0;
    if (continues && began) {
      const half = width / 2, along = { min: g0 - 0.5, max: g1 + 0.5 };
      bridges.push({ id: `bridge-${id}-${bridges.length + 1}`, assetId: 'wf.bridge.level', axis,
        rect: axis === 'z' ? { minX: line - half, maxX: line + half, minZ: along.min, maxZ: along.max } : { minX: along.min, maxX: along.max, minZ: line - half, maxZ: line + half } });
      cursor = hi;
    } else if (!began) cursor = hi;
    else { cursor = b; break; }
  }
  if (cursor < b) seg(cursor, b);
}

function requiredFor(seed: string, coord: ChunkCoord, layout: WorldLayout): ChunkPlan['requiredAnchors'] {
  const { cx, cz } = coord;
  const id = (name: string) => `c${cx}.${cz}:${name}`;
  const out: ChunkPlan['requiredAnchors'] = [];
  if (cx === 0 && cz === 0) out.push({ capability: 'drink-vendor', anchorId: id('vendor-1'), near: { x: layout.spawn.x + 5, z: layout.spawn.z }, nameKey: 'laowang' });
  if (cx === 1 && cz === 0) {
    const oz = rowLine(seed, 0, layout), ox = colLine(seed, 1, layout);
    out.push({ capability: 'direction-helper', anchorId: id('guide-1'), near: { x: ox < 20 ? 30 : 10, z: oz - ROAD_WIDTH.avenue / 2 - 0.8 }, nameKey: 'xiaoli' });
  }
  if (cx === layout.hotel.coord.cx && cz === layout.hotel.coord.cz) out.push({ capability: 'hotel-landmark', anchorId: layout.hotel.anchorId, near: { ...layout.hotel.local } });
  // Guaranteed riverside photo opportunities on the west bank every third row, including row 0.
  if (cx === westBankCol() && mod(cz, 3) === 0) {
    const edge = riverSpan().min - cx * CHUNK_SIZE, z = viewpointZ(seed, cz, layout);
    out.push({ capability: 'river-viewpoint', anchorId: id('viewpoint-1'), near: { x: edge + 0.6, z } });
    out.push({ capability: 'photo-passerby', anchorId: id('passerby-1'), near: { x: edge - 2.2, z: z < CHUNK_SIZE / 2 ? z - 5.5 : z + 5.5 } });
  }
  return out;
}
/** Viewpoint deck position along the west bank, clear of the row's road/bridge. */
export function viewpointZ(seed: string, cz: number, layout = worldLayout(seed)): number {
  return rowLine(seed, cz, layout) < CHUNK_SIZE / 2 ? 30 : 10;
}

export function planChunk(seed: string, coord: ChunkCoord): PlannedChunk {
  const layout = worldLayout(seed);
  const { cx, cz } = coord;
  const connectors = connectorsFor(seed, coord, layout);
  const water = waterFor(cx, cz, layout);
  const has = (edge: Edge, kinds: readonly string[]) => connectors.some((c) => c.edge === edge && kinds.includes(c.kind));
  const ROADS = ['avenue', 'street', 'promenade'];
  const ox = colLine(seed, cx, layout), oz = rowLine(seed, cz, layout);
  const roads: Road[] = [], bridges: Bridge[] = [];
  const north = has('north', ROADS), south = has('south', ROADS), west = has('west', ROADS), east = has('east', ROADS);
  if (north || south) {
    const kind = colKind(cx);
    splitRoad('ns', kind, 'z', ox, north ? 0 : oz, south ? CHUNK_SIZE : oz, ROAD_WIDTH[kind], colName(seed, cx), water, roads, bridges);
  }
  if (west || east) {
    const kind = rowKind(cz);
    splitRoad('ew', kind, 'x', oz, west ? 0 : ox, east ? CHUNK_SIZE : ox, ROAD_WIDTH[kind], rowName(seed, cz), water, roads, bridges);
  }
  const neighbours = {
    north: districtOf(seed, { cx, cz: cz - 1 }), south: districtOf(seed, { cx, cz: cz + 1 }),
    west: districtOf(seed, { cx: cx - 1, cz }), east: districtOf(seed, { cx: cx + 1, cz }),
  };
  return { coord: { cx, cz }, district: districtOf(seed, coord), connectors, water, roads, requiredAnchors: requiredFor(seed, coord, layout), neighbours, bridges };
}
