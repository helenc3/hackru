import { WORLD_RULES } from '../contracts.js';
import {
  CHUNK_SIZE, CITY_LIMITS, ChunkManifestSchema, GENERATOR_VERSION, chunkKey, chunkOrigin,
  type Anchor, type CatalogEntry, type ChunkCollision, type ChunkManifest, type ChunkPlan, type Connector, type Placement, type Rect, type Road,
} from './contracts.js';
import { CATALOG_VERSION, catalogEntry, resolveParams } from './catalog/index.js';
import { canonicalJson, sealManifest, verifyManifestHash } from './hash.js';

// Conventions (shared with planner, fallback and renderer):
// - Chunk-local x grows east, z grows south; north edge is z = 0, south z = 40, west x = 0, east x = 40.
// - Connector offset runs along x on north/south edges and along z on east/west edges.
// - Placement rotation follows three.js rotation.y (degrees): local (x, z) → (x cosθ + z sinθ, −x sinθ + z cosθ).

const GRID = 0.5;
const CELLS = CHUNK_SIZE / GRID;
const WALK_CONNECTORS = new Set<Connector['kind']>(['avenue', 'street', 'lane', 'promenade']);
const ROLE_FOR = { 'drink-vendor': 'vendor', 'direction-helper': 'guide', 'photo-passerby': 'passerby' } as const;

export function rotateRect(rect: Rect, rotation: number): Rect {
  const t = (rotation * Math.PI) / 180, c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t));
  const xs: number[] = [], zs: number[] = [];
  for (const [x, z] of [[rect.minX, rect.minZ], [rect.maxX, rect.minZ], [rect.minX, rect.maxZ], [rect.maxX, rect.maxZ]] as const) { xs.push(x * c + z * s); zs.push(-x * s + z * c); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
const shift = (r: Rect, x: number, z: number): Rect => ({ minX: r.minX + x, maxX: r.maxX + x, minZ: r.minZ + z, maxZ: r.maxZ + z });
const grow = (r: Rect, by: number): Rect => ({ minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by });
/** Strict interior overlap; touching edges (shared lane-house walls) is fine. */
export const overlaps = (a: Rect, b: Rect, eps = 1e-6): boolean => a.minX < b.maxX - eps && b.minX < a.maxX - eps && a.minZ < b.maxZ - eps && b.minZ < a.maxZ - eps;
export const contains = (r: Rect, x: number, z: number): boolean => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const circleHits = (r: Rect, x: number, z: number, radius: number) => Math.hypot(x - Math.max(r.minX, Math.min(x, r.maxX)), z - Math.max(r.minZ, Math.min(z, r.maxZ))) < radius - 1e-7;

/** Carriageway rectangle of an axis-aligned road segment, chunk-local. */
export function roadRect(road: Road): Rect {
  const h = road.width / 2;
  return { minX: Math.min(road.from.x, road.to.x) - (road.from.z === road.to.z ? 0 : h), maxX: Math.max(road.from.x, road.to.x) + (road.from.z === road.to.z ? 0 : h),
    minZ: Math.min(road.from.z, road.to.z) - (road.from.x === road.to.x ? 0 : h), maxZ: Math.max(road.from.z, road.to.z) + (road.from.x === road.to.x ? 0 : h) };
}
/** Chunk-local point where a connector meets its edge. */
export function connectorPoint(connector: Connector): { x: number; z: number } {
  switch (connector.edge) {
    case 'north': return { x: connector.offset, z: 0 };
    case 'south': return { x: connector.offset, z: CHUNK_SIZE };
    case 'west': return { x: 0, z: connector.offset };
    case 'east': return { x: CHUNK_SIZE, z: connector.offset };
  }
}

type Resolved = { placement: Placement; entry: CatalogEntry; solids: Rect[]; walkable: Rect[]; footprint: Rect; clearance: Rect[] };
/** Chunk-local collision of one placement, or a reason it cannot be resolved. */
function resolvePlacement(placement: Placement): Resolved | string {
  const entry = catalogEntry(placement.assetId);
  if (!entry) return `unknown asset ${placement.assetId}`;
  let params;
  try { params = resolveParams(entry, placement.params); } catch (error) { return (error as Error).message; }
  const place = (r: Rect) => shift(rotateRect(r, placement.rotation), placement.x, placement.z);
  const shape = entry.collision(params), size = entry.footprint(params);
  const { front, side } = entry.clearance, w = size.w / 2, d = size.d / 2;
  // Clearance zones: in front (+z local) and at both sides, rotated with the placement.
  const clearance = [front > 0 ? { minX: -w, maxX: w, minZ: d, maxZ: d + front } : null, side > 0 ? { minX: -w - side, maxX: -w, minZ: -d, maxZ: d } : null, side > 0 ? { minX: w, maxX: w + side, minZ: -d, maxZ: d } : null]
    .filter((r): r is Rect => r !== null).map(place);
  return { placement, entry, solids: shape.solids.map(place), walkable: shape.walkable.map(place), footprint: place({ minX: -w, maxX: w, minZ: -d, maxZ: d }), clearance };
}

/** World-coordinate collision for a committed manifest. Unknown/invalid placements contribute nothing (manifests are validated before commit). */
export function deriveCollision(manifest: ChunkManifest): ChunkCollision {
  const o = chunkOrigin(manifest.coord);
  const world = (r: Rect) => shift(r, o.x, o.z);
  const resolved = manifest.placements.map(resolvePlacement).filter((r): r is Resolved => typeof r !== 'string');
  return {
    key: chunkKey(manifest.coord),
    solids: resolved.flatMap((r) => r.solids).map(world),
    walkable: [...resolved.flatMap((r) => r.walkable), ...manifest.bridges.map((b) => b.rect)].map(world),
    water: manifest.water.map((w) => world(w.rect)),
  };
}

/** Circle-of-player test against one chunk's collision, world coordinates. */
export function walkableIn(collision: ChunkCollision, x: number, z: number, radius: number = WORLD_RULES.playerRadius): boolean {
  if (collision.solids.some((r) => circleHits(r, x, z, radius))) return false;
  return !collision.water.some((r) => circleHits(r, x, z, radius)) || collision.walkable.some((r) => contains(r, x, z));
}

type Issue = { message: string; placementId?: string; anchorId?: string; structural?: boolean };
type Options = { requireHash?: boolean };

function reachability(manifest: ChunkManifest, local: ChunkCollision, issues: Issue[]): void {
  // Rasterized walkableIn (square-grown rects, slightly conservative at corners): water, then decks, then solids.
  const blocked = new Uint8Array(CELLS * CELLS);
  const paint = (rect: Rect, value: 0 | 1) => {
    const i0 = Math.max(0, Math.ceil(rect.minX / GRID - 0.5)), i1 = Math.min(CELLS - 1, Math.floor(rect.maxX / GRID - 0.5));
    const j0 = Math.max(0, Math.ceil(rect.minZ / GRID - 0.5)), j1 = Math.min(CELLS - 1, Math.floor(rect.maxZ / GRID - 0.5));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) blocked[i * CELLS + j] = value;
  };
  const r = WORLD_RULES.playerRadius;
  for (const w of local.water) paint(grow(w, r), 1);
  for (const w of local.walkable) paint(w, 0);
  for (const s of local.solids) paint(grow(s, r), 1);
  const cell = (x: number, z: number) => [Math.min(CELLS - 1, Math.max(0, Math.floor(x / GRID))), Math.min(CELLS - 1, Math.max(0, Math.floor(z / GRID)))] as const;
  const open = (i: number, j: number) => blocked[i * CELLS + j] === 0;
  const starts = manifest.connectors.filter((c) => WALK_CONNECTORS.has(c.kind)).map((c) => {
    // Any open edge cell within the connector's width counts as its mouth.
    const p = connectorPoint(c), along = c.edge === 'north' || c.edge === 'south';
    for (let d = 0; d <= c.width / 2; d += GRID) for (const s of [d, -d]) {
      const [i, j] = cell(along ? p.x + s : p.x, along ? p.z : p.z + s);
      if (open(i, j)) return { connector: c, cell: [i, j] as const };
    }
    return { connector: c, cell: null };
  });
  for (const s of starts) if (!s.cell) issues.push({ message: `connector ${s.connector.edge}@${s.connector.offset} is blocked at the edge` });
  const first = starts.find((s) => s.cell)?.cell;
  if (!first) return;
  const seen = new Uint8Array(CELLS * CELLS), queue = [first[0] * CELLS + first[1]];
  seen[queue[0]!] = 1;
  for (let k = 0; k < queue.length; k++) {
    const i = Math.floor(queue[k]! / CELLS), j = queue[k]! % CELLS;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a! < 0 || b! < 0 || a! >= CELLS || b! >= CELLS) continue;
      const n = a! * CELLS + b!;
      if (!seen[n] && open(a!, b!)) { seen[n] = 1; queue.push(n); }
    }
  }
  for (const s of starts) if (s.cell && !seen[s.cell[0] * CELLS + s.cell[1]]) issues.push({ message: `connector ${s.connector.edge}@${s.connector.offset} is not connected to the street network` });
  for (const a of manifest.anchors) {
    // Stand point must be open and reached; a 1-cell ring tolerates a stand point flush against its counter.
    const [i, j] = cell(a.x, a.z);
    const ok = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => { const a2 = i + di!, b2 = j + dj!; return a2 >= 0 && b2 >= 0 && a2 < CELLS && b2 < CELLS && seen[a2 * CELLS + b2] === 1; });
    if (!ok) issues.push({ message: `anchor ${a.id} stand point is unreachable`, anchorId: a.id });
  }
}

function inspect(manifest: ChunkManifest, plan: ChunkPlan, options: Options): Issue[] {
  const issues: Issue[] = [];
  const structural = (message: string) => issues.push({ message, structural: true });
  const parsed = ChunkManifestSchema.safeParse(manifest);
  if (!parsed.success) { structural(`schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`); return issues; }
  if (manifest.catalogVersion !== CATALOG_VERSION) structural(`catalogVersion ${manifest.catalogVersion} ≠ ${CATALOG_VERSION}`);
  if (manifest.generatorVersion !== GENERATOR_VERSION) structural(`generatorVersion ${manifest.generatorVersion} ≠ ${GENERATOR_VERSION}`);
  if (chunkKey(manifest.coord) !== chunkKey(plan.coord)) structural('coord does not match plan');
  if (manifest.district !== plan.district) structural('district does not match plan');
  if (options.requireHash !== false && !verifyManifestHash(manifest)) structural('contentHash mismatch');
  // Planner compliance: connectors and water exactly, planner roads present verbatim.
  const set = (values: unknown[]) => values.map(canonicalJson).sort().join('|');
  if (set(manifest.connectors) !== set(plan.connectors)) structural('connectors differ from plan');
  if (set(manifest.water) !== set(plan.water)) structural('water differs from plan');
  const roads = new Set(manifest.roads.map(canonicalJson));
  for (const road of plan.roads) if (!roads.has(canonicalJson(road))) structural(`planner road ${road.id} missing or altered`);
  if (new Set(manifest.roads.map((r) => r.id)).size !== manifest.roads.length) structural('duplicate road id');
  for (const bridge of manifest.bridges) {
    const entry = catalogEntry(bridge.assetId);
    if (!entry || entry.category !== 'waterfront') structural(`bridge ${bridge.id} uses non-bridge asset ${bridge.assetId}`);
    const crossing = manifest.water.some((w) => overlaps(bridge.rect, w.rect) && (bridge.axis === 'x' ? bridge.rect.minX < w.rect.minX && bridge.rect.maxX > w.rect.maxX : bridge.rect.minZ < w.rect.minZ && bridge.rect.maxZ > w.rect.maxZ));
    if (!crossing) structural(`bridge ${bridge.id} does not span a water crossing`);
  }
  const roadRects = manifest.roads.map(roadRect), waterRects = manifest.water.map((w) => w.rect);

  // Placements.
  const ids = new Set<string>();
  const kept: Resolved[] = [];
  const byId = new Map<string, Resolved>();
  let triangles = 0, drawCalls = 0;
  const instanced = new Set<string>();
  const hotel = plan.requiredAnchors.find((a) => a.capability === 'hotel-landmark');
  for (const placement of manifest.placements) {
    const bad = (message: string) => issues.push({ message: `placement ${placement.id}: ${message}`, placementId: placement.id });
    if (ids.has(placement.id)) { bad('duplicate id'); continue; }
    ids.add(placement.id);
    const resolved = resolvePlacement(placement);
    if (typeof resolved === 'string') { bad(resolved); continue; }
    const { entry } = resolved;
    if (entry.review !== 'approved') { bad(`${entry.id} is not approved`); continue; }
    if (entry.id === 'an.hotel.grand' && !hotel) { bad('the hotel exists only in the planner hotel chunk'); continue; }
    if (placement.attachTo) {
      const parent = byId.get(placement.attachTo.placementId);
      const socket = parent?.entry.sockets(resolveParams(parent.entry, parent.placement.params)).find((s) => s.id === placement.attachTo!.socketId);
      if (!entry.attachesTo?.length) { bad(`${entry.id} cannot attach to sockets`); continue; }
      if (!parent) { bad(`attach parent ${placement.attachTo.placementId} missing or declared later`); continue; }
      if (!socket || !entry.attachesTo.includes(socket.kind)) { bad(`incompatible socket ${placement.attachTo.socketId}`); continue; }
    } else if (entry.placement === 'socket') { bad(`${entry.id} must attach to a socket`); continue; }
    const f = resolved.footprint;
    if (!placement.attachTo && (f.minX < -1e-6 || f.minZ < -1e-6 || f.maxX > CHUNK_SIZE + 1e-6 || f.maxZ > CHUNK_SIZE + 1e-6)) { bad('footprint leaves the chunk'); continue; }
    if (resolved.solids.length && entry.placement !== 'water-edge' && entry.placement !== 'water' && resolved.solids.some((s) => waterRects.some((w) => overlaps(s, w)))) { bad('solid overlaps water'); continue; }
    if (resolved.solids.length && entry.placement === 'ground' && resolved.solids.some((s) => roadRects.some((r) => overlaps(s, r)))) { bad('solid overlaps a road'); continue; }
    const structure = (r: Resolved) => !r.placement.attachTo && r.entry.placement === 'ground' && (r.entry.category === 'building' || r.entry.category === 'anchor') && r.solids.length > 0;
    if (structure(resolved)) {
      // Symmetric: neither solid may intrude on the other's solids or clearance zones.
      const hits = (a: Rect[], b: Rect[]) => a.some((x) => b.some((y) => overlaps(x, y)));
      const blocker = kept.find((other) => structure(other) && (hits(resolved.solids, other.solids) || hits(resolved.clearance, other.solids) || hits(other.clearance, resolved.solids)));
      if (blocker) { bad(`overlaps or crowds ${blocker.placement.id}`); continue; }
    }
    if (entry.cost.instanced) { if (!instanced.has(entry.id)) { instanced.add(entry.id); drawCalls += entry.cost.drawCalls; } } else drawCalls += entry.cost.drawCalls;
    triangles += entry.cost.triangles;
    if (triangles > CITY_LIMITS.maxTriangles || drawCalls > CITY_LIMITS.maxDrawCalls) { bad('exceeds the chunk rendering budget'); triangles -= entry.cost.triangles; continue; }
    kept.push(resolved); byId.set(placement.id, resolved);
  }

  // Anchors: capability comes from the bound placement's catalog entry.
  const anchorIds = new Set<string>();
  for (const anchor of manifest.anchors) {
    const bad = (message: string) => issues.push({ message: `anchor ${anchor.id}: ${message}`, anchorId: anchor.id });
    if (anchorIds.has(anchor.id)) { bad('duplicate id'); continue; }
    anchorIds.add(anchor.id);
    const bound = byId.get(anchor.placementId);
    if (!bound) { bad(`placement ${anchor.placementId} missing or invalid`); continue; }
    if (!bound.entry.capabilities.includes(anchor.capability)) { bad(`${bound.entry.id} does not grant ${anchor.capability}`); continue; }
    if (anchor.capability === 'hotel-landmark' && (bound.entry.id !== 'an.hotel.grand' || anchor.id !== hotel?.anchorId)) { bad('only the reserved an.hotel.grand may be the hotel'); continue; }
    const role = ROLE_FOR[anchor.capability as keyof typeof ROLE_FOR];
    if (role && (anchor.kind !== 'npc' || anchor.role !== role)) { bad(`${anchor.capability} anchors are npc anchors with role ${role}`); continue; }
    if (!role && anchor.role) { bad('only NPC capabilities carry a role'); continue; }
  }
  for (const required of plan.requiredAnchors) {
    const anchor = manifest.anchors.find((a) => a.id === required.anchorId && a.capability === required.capability);
    if (!anchor) structural(`required ${required.capability} anchor ${required.anchorId} missing`);
    else if (required.near && Math.hypot(anchor.x - required.near.x, anchor.z - required.near.z) > 10) structural(`required anchor ${required.anchorId} is too far from its planned spot`);
  }
  if (!issues.some((i) => i.structural)) {
    const local = deriveCollision({ ...manifest, coord: { cx: 0, cz: 0 }, placements: kept.map((k) => k.placement) });
    reachability(manifest, local, issues);
  }
  return issues;
}

export function validateManifest(manifest: ChunkManifest, plan: ChunkPlan, options: Options = {}): { ok: true } | { ok: false; errors: string[] } {
  const issues = inspect(manifest, plan, options);
  return issues.length ? { ok: false, errors: issues.map((i) => i.message) } : { ok: true };
}

/**
 * Deterministic repair: restore planner-owned fields, then drop offending optional placements and
 * anchors (and anything attached to them) until the manifest validates. Required anchors are never
 * dropped; if one cannot be kept, returns null so the caller uses the seeded fallback.
 */
export function repairManifest(manifest: ChunkManifest, plan: ChunkPlan): ChunkManifest | null {
  const plannerRoads = new Set(plan.roads.map((r) => r.id));
  let current: ChunkManifest = sealManifest({
    ...manifest, coord: plan.coord, district: plan.district, catalogVersion: CATALOG_VERSION, generatorVersion: GENERATOR_VERSION,
    connectors: plan.connectors, water: plan.water, roads: [...plan.roads, ...manifest.roads.filter((r) => !plannerRoads.has(r.id))],
  });
  const required = new Set(plan.requiredAnchors.map((a) => a.anchorId));
  const protectedPlacements = () => new Set(current.anchors.filter((a) => required.has(a.id)).map((a) => a.placementId));
  for (let round = 0; round < CITY_LIMITS.maxPlacements + CITY_LIMITS.maxAnchors + 4; round++) {
    const issues = inspect(current, plan, {});
    if (!issues.length) return current;
    if (!ChunkManifestSchema.safeParse(current).success) return null;
    const keep = protectedPlacements();
    const dropPlacements = new Set(issues.flatMap((i) => i.placementId ? [i.placementId] : []));
    const dropAnchors = new Set(issues.flatMap((i) => i.anchorId && !required.has(i.anchorId) ? [i.anchorId] : []));
    if ([...dropPlacements].some((id) => keep.has(id))) return null;
    if (!dropPlacements.size && !dropAnchors.size) {
      // Remaining issues are structural or reachability: drop the last droppable solid placement and retry.
      if (issues.some((i) => i.structural || (i.anchorId && required.has(i.anchorId)) || !i.anchorId)) {
        const victim = [...current.placements].reverse().find((p) => !keep.has(p.id) && !current.placements.some((c) => c.attachTo?.placementId === p.id && keep.has(c.id)) && (resolvePlacement(p) as Resolved).solids?.length);
        if (!victim || issues.some((i) => i.structural)) return null;
        dropPlacements.add(victim.id);
      }
    }
    // Cascade: attachments of dropped parents, anchors bound to dropped placements.
    let grew = true;
    while (grew) { grew = false; for (const p of current.placements) if (p.attachTo && dropPlacements.has(p.attachTo.placementId) && !dropPlacements.has(p.id)) { dropPlacements.add(p.id); grew = true; } }
    for (const a of current.anchors) if (dropPlacements.has(a.placementId)) { if (required.has(a.id)) return null; dropAnchors.add(a.id); }
    current = sealManifest({ ...current, placements: current.placements.filter((p) => !dropPlacements.has(p.id)), anchors: current.anchors.filter((a: Anchor) => !dropAnchors.has(a.id)) });
  }
  return null;
}
