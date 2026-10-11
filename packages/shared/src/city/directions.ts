import { DirectionsSchema, type Directions, type Position } from '../contracts.js';
import { chunkKey, chunkOf, chunkOrigin, type ChunkManifest, type Road } from './contracts.js';
import { canonicalJson, sha256Hex } from './hash.js';
import { planChunk, worldLayout } from './planner.js';
import { text } from './text-catalog.js';

// Truthful hotel directions (NEW_QUESTS Q2): a shortest, few-turn route over real road segments —
// committed roads where a chunk is committed, the deterministic planner roads elsewhere (they are
// committed verbatim later). Text uses only those roads' catalog names and committed landmarks.

type Dir = 'east' | 'west' | 'north' | 'south';
const DIRS: Record<Dir, { zh: string; v: [number, number] }> = { east: { zh: '东', v: [1, 0] }, west: { zh: '西', v: [-1, 0] }, north: { zh: '北', v: [0, -1] }, south: { zh: '南', v: [0, 1] } };
type Segment = { a: Position; b: Position; nameKey?: string };
type Edge = { to: number; dir: Dir; length: number; segment: number };
const TURN_PENALTY = 25;
const MAX_STREET_GAP = 15;
const key = (p: Position) => `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
const dirOf = (a: Position, b: Position): Dir => Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? (b.x > a.x ? 'east' : 'west') : (b.z > a.z ? 'south' : 'north');

function project(p: Position, s: Segment): Position {
  const clamp = (v: number, lo: number, hi: number) => Math.max(Math.min(lo, hi), Math.min(v, Math.max(lo, hi)));
  return s.a.x === s.b.x ? { x: s.a.x, z: clamp(p.z, s.a.z, s.b.z) } : { x: clamp(p.x, s.a.x, s.b.x), z: s.a.z };
}
const onSegment = (p: Position, s: Segment) => { const q = project(p, s); return Math.hypot(q.x - p.x, q.z - p.z) < 0.01; };

export function routeToHotel(seed: string, manifests: ReadonlyMap<string, ChunkManifest>, fromAnchor: { id: string; position: Position }): Directions | null {
  const layout = worldLayout(seed);
  const hotelManifest = manifests.get(chunkKey(layout.hotel.coord));
  const hotelAnchor = hotelManifest?.anchors.find((a) => a.id === layout.hotel.anchorId);
  const ho = chunkOrigin(layout.hotel.coord);
  const hotel = hotelAnchor ? { x: ho.x + hotelAnchor.x, z: ho.z + hotelAnchor.z } : { x: ho.x + layout.hotel.local.x, z: ho.z + layout.hotel.local.z };

  // Road segments over the bounding box of both ends plus one chunk of margin.
  const s = chunkOf(fromAnchor.position), h = layout.hotel.coord;
  const segments: Segment[] = [];
  const landmarks: { position: Position; zh: string; english: string }[] = [];
  for (let cx = Math.min(s.cx, h.cx) - 1; cx <= Math.max(s.cx, h.cx) + 1; cx++) for (let cz = Math.min(s.cz, h.cz) - 1; cz <= Math.max(s.cz, h.cz) + 1; cz++) {
    const manifest = manifests.get(chunkKey({ cx, cz }));
    const o = chunkOrigin({ cx, cz });
    const roads: Road[] = manifest ? manifest.roads : planChunk(seed, { cx, cz }).roads;
    for (const road of roads) segments.push({ a: { x: o.x + road.from.x, z: o.z + road.from.z }, b: { x: o.x + road.to.x, z: o.z + road.to.z }, nameKey: road.nameKey });
    for (const a of manifest?.anchors ?? []) {
      const row = a.kind === 'landmark' && a.capability !== 'hotel-landmark' && a.nameKey ? text('landmark', a.nameKey) : undefined;
      if (row) landmarks.push({ position: { x: o.x + a.x, z: o.z + a.z }, zh: row.zh, english: row.english });
    }
  }
  const usable = segments.filter((seg) => Math.hypot(seg.a.x - seg.b.x, seg.a.z - seg.b.z) > 0.01);
  if (!usable.length) return null;
  const nearest = (p: Position) => usable.reduce((best, seg) => { const q = project(p, seg); const d = Math.hypot(q.x - p.x, q.z - p.z); return d < best.d ? { q, d } : best; }, { q: usable[0]!.a, d: Infinity }).q;
  const start = nearest(fromAnchor.position), end = nearest(hotel);
  // Both ends must sit on the street network; never describe a road the player cannot see from there.
  if (Math.hypot(start.x - fromAnchor.position.x, start.z - fromAnchor.position.z) > MAX_STREET_GAP || Math.hypot(end.x - hotel.x, end.z - hotel.z) > MAX_STREET_GAP) return null;

  // Graph: every segment split at endpoints, crossings, and the two projections.
  const nodes: Position[] = [], index = new Map<string, number>(), edges: Edge[][] = [];
  const node = (p: Position) => { const k = key(p); let i = index.get(k); if (i === undefined) { i = nodes.length; index.set(k, i); nodes.push(p); edges.push([]); } return i; };
  usable.forEach((seg, si) => {
    const points = [seg.a, seg.b, start, end].filter((p) => onSegment(p, seg));
    for (const other of usable) {
      if (other === seg) continue;
      for (const p of [other.a, other.b]) if (onSegment(p, seg)) points.push(p);
      const cross = seg.a.x === seg.b.x ? { x: seg.a.x, z: other.a.z } : { x: other.a.x, z: seg.a.z };
      if (onSegment(cross, seg) && onSegment(cross, other)) points.push(cross);
    }
    const along = seg.a.x === seg.b.x ? (p: Position) => p.z : (p: Position) => p.x;
    const sorted = [...new Map(points.map((p) => [key(p), p])).values()].sort((p, q) => along(p) - along(q));
    for (let i = 1; i < sorted.length; i++) {
      const a = node(sorted[i - 1]!), b = node(sorted[i]!), length = Math.hypot(sorted[i]!.x - sorted[i - 1]!.x, sorted[i]!.z - sorted[i - 1]!.z);
      edges[a]!.push({ to: b, dir: dirOf(sorted[i - 1]!, sorted[i]!), length, segment: si });
      edges[b]!.push({ to: a, dir: dirOf(sorted[i]!, sorted[i - 1]!), length, segment: si });
    }
  });
  const from = index.get(key(start)), to = index.get(key(end));
  if (from === undefined || to === undefined) return null;

  // Dijkstra over (node, heading) with a turn penalty, so the route stays describable.
  // ponytail: O(V²) scan; a heap if road graphs ever exceed a few thousand nodes.
  const headings: (Dir | 'none')[] = ['none', 'east', 'west', 'north', 'south'];
  const state = (n: number, d: Dir | 'none') => n * 5 + headings.indexOf(d);
  const dist = new Map<number, number>([[state(from, 'none'), 0]]), prev = new Map<number, { s: number; edge: Edge }>(), done = new Set<number>();
  let goal: number | undefined;
  for (;;) {
    let current: number | undefined, best = Infinity;
    for (const [st, d] of dist) if (!done.has(st) && d < best) { best = d; current = st; }
    if (current === undefined) break;
    done.add(current);
    const n = Math.floor(current / 5), heading = headings[current % 5]!;
    if (n === to) { goal = current; break; }
    for (const edge of edges[n]!) {
      const next = state(edge.to, edge.dir), cost = best + edge.length + (heading !== 'none' && heading !== edge.dir ? TURN_PENALTY : 0);
      if (cost < (dist.get(next) ?? Infinity)) { dist.set(next, cost); prev.set(next, { s: current, edge }); }
    }
  }
  if (goal === undefined) return null;
  const path: { from: Position; edge: Edge }[] = [];
  for (let st = goal; prev.has(st); st = prev.get(st)!.s) path.unshift({ from: nodes[Math.floor(prev.get(st)!.s / 5)]!, edge: prev.get(st)!.edge });

  // Runs of one heading; the name is the run's longest named segment.
  const runs: { dir: Dir; length: number; start: Position; nameKey?: string }[] = [];
  for (const step of path) {
    const last = runs.at(-1);
    if (last && last.dir === step.edge.dir) last.length += step.edge.length;
    else runs.push({ dir: step.edge.dir, length: step.edge.length, start: step.from });
    const run = runs.at(-1)!;
    run.nameKey ??= usable[step.edge.segment]!.nameKey;
  }
  const meaningful = runs.filter((run) => run.length >= 1);
  const roadName = (nameKey?: string) => (nameKey ? text('road-name', nameKey) : undefined);
  const hotelName = text('landmark', 'grand-hotel')!;
  const steps: Directions['steps'] = [];
  meaningful.forEach((run, i) => {
    const road = roadName(run.nameKey), dir = DIRS[run.dir];
    if (i === 0) { steps.push({ textZh: `沿着${road?.zh ?? '这条路'}往${dir.zh}走`, english: `Walk ${run.dir} along ${road?.english ?? 'this street'}` }); return; }
    const [px, pz] = DIRS[meaningful[i - 1]!.dir].v, [nx, nz] = dir.v;
    const right = px * nz - pz * nx > 0;
    const mark = landmarks.find((l) => Math.hypot(l.position.x - run.start.x, l.position.z - run.start.z) <= 12);
    steps.push({
      textZh: `到${road?.zh ?? '路口'}${right ? '右' : '左'}转${mark ? `（${mark.zh}旁边）` : ''}，往${dir.zh}走`,
      english: `Turn ${right ? 'right' : 'left'} ${road ? `onto ${road.english}` : 'at the intersection'}${mark ? ` by the ${mark.english}` : ''} and head ${run.dir}`,
    });
  });
  const last = meaningful.at(-1);
  if (last) {
    const [vx, vz] = DIRS[last.dir].v, side = vx * (hotel.z - end.z) - vz * (hotel.x - end.x);
    steps.push(Math.abs(side) < 0.5 ? { textZh: `${hotelName.zh}就在前面`, english: `${hotelName.english} is straight ahead` }
      : { textZh: `${hotelName.zh}在${side > 0 ? '右' : '左'}边`, english: `${hotelName.english} is on your ${side > 0 ? 'right' : 'left'}` });
  } else steps.push({ textZh: `${hotelName.zh}就在这儿`, english: `${hotelName.english} is right here` });
  if (steps.length > 8) return null;
  const textZh = `${steps.map((step) => step.textZh).join('，')}。`;
  if (textZh.length > 240) return null;
  return DirectionsSchema.parse({ routeId: `route.${sha256Hex(canonicalJson({ from: fromAnchor.id, steps })).slice(0, 16)}`, fromAnchorId: fromAnchor.id, hotelAnchorId: layout.hotel.anchorId, textZh, steps });
}
