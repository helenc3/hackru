import {
  CHUNK_SIZE, CITY_LIMITS, GENERATOR_VERSION,
  type Anchor, type CatalogEntry, type ChunkCoord, type ChunkManifest, type DistrictKind, type ParamValues, type Placement, type QuestContextSnapshot, type Rect, type Road,
} from './contracts.js';
import type { ChunkPlan } from './contracts.js';
import { CATALOG, CATALOG_VERSION, catalogEntry, resolveParams } from './catalog/index.js';
import { TEXT_CATALOG } from './text-catalog.js';
import { npcIdentity } from './npc-identity.js';
import { sealManifest } from './hash.js';
import { planChunk, SIDEWALK, worldLayout } from './planner.js';
import { createRng } from './rng.js';
import { overlaps, repairManifest, roadRect, rotateRect, validateManifest } from './validate.js';
/** npc-name keys reserved for the planner's quest givers (spawn vendor 老王, guide 小李). */
const QUEST_GIVERS = ['laowang', 'xiaoli'];
/** Shop signs name what the building sells; generic shops draw from ordinary retail. */
const SHOP_SIGNS: Record<string, readonly string[]> = {
  'bld.cafe.small': ['tea', 'bakery'], 'bld.restaurant.noodle': ['noodles'], 'bld.restaurant.dimsum': ['dumplings'], 'bld.market.hall': ['market', 'fruit'],
};
const RETAIL_SIGNS = ['bakery', 'fruit', 'books', 'flowers', 'pharmacy', 'clothes', 'convenience', 'snacks', 'bank'];

// Seeded fallback composer (CITY_GENERATION §4, §6, §9). Uses only approved catalog entries, keeps
// every planner-owned field verbatim, and places required quest anchors exactly where the plan says.
// Coding is generic over catalog metadata (category, district, placement rule, capability, sockets).

type Face = 'n' | 's' | 'e' | 'w';
type Rot = 0 | 90 | 180 | 270;
/** Front direction of an item per face; rotation follows three.js rotation.y (validate.ts). */
const FACE: Record<Face, { rot: Rot; dx: number; dz: number }> = { s: { rot: 0, dx: 0, dz: 1 }, e: { rot: 90, dx: 1, dz: 0 }, n: { rot: 180, dx: 0, dz: -1 }, w: { rot: 270, dx: -1, dz: 0 } };
const BUDGET = { triangles: CITY_LIMITS.maxTriangles * 0.9, drawCalls: CITY_LIMITS.maxDrawCalls * 0.9, placements: CITY_LIMITS.maxPlacements - 6 };
const VENDOR_BASE: Record<DistrictKind, number> = { shopping: 0.6, historic: 0.45, waterfront: 0.4, office: 0.3, residential: 0.25, park: 0.2, industrial: 0.1 };
/** Extra pick weight for a district's signature building families. */
const KIT: Record<DistrictKind, RegExp> = {
  shopping: /^bld\.(shop|cafe|restaurant|market)/, historic: /^bld\.lanehouse/, residential: /^bld\.apartment/, office: /^bld\.office/,
  industrial: /^bld\.warehouse/, waterfront: /^bld\.(cafe|restaurant|warehouse|shop)/, park: /^$/,
};
const ATTACH_P: Record<DistrictKind, number> = { shopping: 0.85, historic: 0.7, waterfront: 0.6, office: 0.45, residential: 0.35, park: 0.3, industrial: 0.25 };

const rotatePoint = (x: number, z: number, rot: number) => {
  const t = (rot * Math.PI) / 180, c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t));
  return { x: x * c + z * s, z: -x * s + z * c };
};
const shift = (r: Rect, x: number, z: number): Rect => ({ minX: r.minX + x, maxX: r.maxX + x, minZ: r.minZ + z, maxZ: r.maxZ + z });
const square = (x: number, z: number, half: number): Rect => ({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
const bbox = (rects: Rect[]): Rect | null => rects.length ? { minX: Math.min(...rects.map((r) => r.minX)), maxX: Math.max(...rects.map((r) => r.maxX)), minZ: Math.min(...rects.map((r) => r.minZ)), maxZ: Math.max(...rects.map((r) => r.maxZ)) } : null;
const round = (v: number) => Math.round(v * 100) / 100;

type Lot = { rect: Rect; faces: Face[] };
type PlaceOptions = { onRoad?: boolean; attachTo?: { placementId: string; socketId: string }; required?: boolean };

export function generateFallbackChunk(worldId: string, seed: string, coord: ChunkCoord, questContext: QuestContextSnapshot, plan: ChunkPlan = planChunk(seed, coord)): ChunkManifest {
  const { cx, cz } = coord;
  const rng = createRng(seed, 'fallback', cx, cz);
  const pick = <T>(items: readonly T[]): T | undefined => items[Math.floor(rng() * items.length)];
  const district = plan.district;
  const weight = (category: keyof QuestContextSnapshot['weights']) => questContext.weights[category] ?? 1;

  const roadRects = plan.roads.map(roadRect);
  const waterRects = plan.water.map((w) => w.rect);
  const bridgeRects = plan.bridges.map((b) => b.rect);
  const placements: Placement[] = [];
  const anchors: Anchor[] = [];
  const blocks: Rect[] = [];      // occupancy of solid items (footprint for ground items, solid bbox otherwise)
  const flats: Rect[] = [];       // walkable ground cover (lawns, courtyards)
  const keep: Rect[] = [];        // stand points, spawn
  const npcSpace: Rect[] = [];    // character bodies, including non-colliding socket vendors
  const structures: { solids: Rect[]; zones: Rect[] }[] = []; // validator "structures" (symmetric clearance rule)
  const budget = { triangles: 0, drawCalls: 0, instanced: new Set<string>() };
  let serial = 0;
  const approved = (entry: CatalogEntry | undefined): entry is CatalogEntry => Boolean(entry && entry.review === 'approved');
  const entries = (filter: (entry: CatalogEntry) => boolean) => CATALOG.filter((entry) => approved(entry) && filter(entry));
  /** Names other than the quest givers, so 老王 and 小李 stay unique. */
  // 小林 was the old spawn vendor; random NPCs don't reuse it.
  const extraNames = () => Object.keys(TEXT_CATALOG['npc-name']).filter((k) => !QUEST_GIVERS.includes(k) && k !== 'xiaolin');
  const randomName = () => {
    const gender = rng() < 0.5 ? 'male' : 'female';
    return pick(extraNames().filter((name) => npcIdentity(name)?.gender === gender))!;
  };

  if (cx === 0 && cz === 0) { const s = worldLayout(seed).spawn; keep.push(square(s.x, s.z, 1.5)); }

  function randomParams(entry: CatalogEntry, overrides: ParamValues = {}): ParamValues {
    const out: ParamValues = {};
    for (const [key, spec] of Object.entries(entry.params)) {
      if (key in overrides) { out[key] = overrides[key]!; continue; }
      switch (spec.type) {
        case 'number': { const raw = spec.min + rng() * (spec.max - spec.min); out[key] = spec.step ? Math.min(spec.max, round(spec.min + Math.round((raw - spec.min) / spec.step) * spec.step)) : round(raw); break; }
        case 'int': { const min = key === 'floors' || key === 'stories' ? Math.max(spec.min, spec.max - 2) : spec.min; out[key] = min + Math.floor(rng() * (spec.max - min + 1)); break; }
        case 'enum': out[key] = pick(spec.values)!; break;
        case 'boolean': out[key] = rng() < 0.5; break;
        case 'text': {
          const keys = Object.keys(TEXT_CATALOG[spec.catalog]).filter((k) => spec.catalog !== 'npc-name' || !QUEST_GIVERS.includes(k));
          // Notices and vendor names keep their entry's sensible default; random notices put 禁止游泳 on a guard booth.
          out[key] = spec.catalog === 'menu' ? 'drinks' : spec.catalog === 'notice' || (spec.catalog === 'shop-name' && entry.capabilities.includes('drink-vendor')) ? spec.default : pick(keys) ?? spec.default; break;
        }
      }
    }
    return out;
  }
  function resolved(entry: CatalogEntry, params: ParamValues): ParamValues | null {
    try { return resolveParams(entry, params); } catch { return null; }
  }
  const structure = (entry: CatalogEntry, solids: Rect[], attached: boolean) => !attached && entry.placement === 'ground' && (entry.category === 'building' || entry.category === 'anchor') && solids.length > 0;
  function clearanceZones(entry: CatalogEntry, params: ParamValues, x: number, z: number, rot: Rot): Rect[] {
    const f = entry.footprint(params), { front, side } = entry.clearance;
    return [
      front > 0 ? { minX: -f.w / 2, maxX: f.w / 2, minZ: f.d / 2, maxZ: f.d / 2 + front } : null,
      side > 0 ? { minX: -f.w / 2 - side, maxX: -f.w / 2, minZ: -f.d / 2, maxZ: f.d / 2 } : null,
      side > 0 ? { minX: f.w / 2, maxX: f.w / 2 + side, minZ: -f.d / 2, maxZ: f.d / 2 } : null,
    ].filter((r): r is Rect => r !== null).map((r) => shift(rotateRect(r, rot), x, z));
  }

  /** Validate locally against the same rules validateManifest applies (plus visual occupancy); commit or return null. */
  function place(entry: CatalogEntry | undefined, rawParams: ParamValues, x: number, z: number, rot: Rot, options: PlaceOptions = {}): string | null {
    if (!approved(entry)) return null;
    if (!options.required && (placements.length >= BUDGET.placements)) return null;
    const params = resolved(entry, rawParams);
    if (!params) return null;
    x = round(x); z = round(z);
    if (x < 0 || x > CHUNK_SIZE || z < 0 || z > CHUNK_SIZE) return null;
    const size = entry.footprint(params);
    const fp = shift(rotateRect({ minX: -size.w / 2, maxX: size.w / 2, minZ: -size.d / 2, maxZ: size.d / 2 }, rot), x, z);
    const solids = entry.collision(params).solids.map((r) => shift(rotateRect(r, rot), x, z));
    const attached = Boolean(options.attachTo);
    if (npcSpace.some((space) => overlaps(fp, space))) return null;
    if (entry.id.startsWith('an.npc.') && placements.some((other) => {
      if (other.id === options.attachTo?.placementId) return false;
      const catalog = catalogEntry(other.assetId)!;
      return catalog.collision(resolveParams(catalog, other.params)).solids.some((solid) =>
        overlaps(fp, shift(rotateRect(solid, other.rotation), other.x, other.z)));
    })) return null;
    const wet = entry.placement === 'water' || entry.placement === 'water-edge';
    if (!attached) {
      if (fp.minX < -1e-6 || fp.minZ < -1e-6 || fp.maxX > CHUNK_SIZE + 1e-6 || fp.maxZ > CHUNK_SIZE + 1e-6) return null;
      const flat = solids.length === 0 && entry.placement === 'ground';
      const occupancy = entry.placement === 'ground' ? fp : bbox(solids) ?? fp;
      if (!wet && (entry.placement === 'ground' ? [fp] : solids).some((r) => waterRects.some((w) => overlaps(r, w)))) return null;
      if (entry.placement === 'ground' && roadRects.some((r) => overlaps(fp, r))) return null;
      if (entry.placement === 'sidewalk' && !options.onRoad && solids.some((s) => roadRects.some((r) => overlaps(s, r)))) return null;
      if ((wet ? [fp] : solids).some((s) => bridgeRects.some((b) => overlaps(s, b)))) return null;
      if (flat ? [...blocks, ...flats].some((r) => overlaps(fp, r)) : blocks.some((r) => overlaps(occupancy, r))) return null;
      if (solids.some((s) => keep.some((k) => overlaps(s, k))) || (flat && keep.some((k) => overlaps(fp, k)))) return null;
      if (structure(entry, solids, attached)) {
        const zones = clearanceZones(entry, params, x, z, rot);
        const hits = (a: Rect[], b: Rect[]) => a.some((r) => b.some((t) => overlaps(r, t)));
        if (structures.some((other) => hits(solids, other.solids) || hits(zones, other.solids) || hits(solids, other.zones))) return null;
      }
      (flat ? flats : blocks).push(occupancy);
    } else if (solids.some((s) => waterRects.some((w) => overlaps(s, w)) || keep.some((k) => overlaps(s, k)))) return null;
    const instancedNew = entry.cost.instanced && !budget.instanced.has(entry.id);
    const draw = entry.cost.instanced ? (instancedNew ? entry.cost.drawCalls : 0) : entry.cost.drawCalls;
    const limit = options.required ? { triangles: CITY_LIMITS.maxTriangles, drawCalls: CITY_LIMITS.maxDrawCalls } : BUDGET;
    if (budget.triangles + entry.cost.triangles > limit.triangles || budget.drawCalls + draw > limit.drawCalls) {
      if (!attached) (entry.placement === 'ground' && solids.length === 0 ? flats : blocks).pop();
      return null;
    }
    budget.triangles += entry.cost.triangles; budget.drawCalls += draw;
    if (entry.cost.instanced) budget.instanced.add(entry.id);
    if (structure(entry, solids, attached)) structures.push({ solids, zones: clearanceZones(entry, params, x, z, rot) });
    const id = `p${++serial}`;
    placements.push({ id, assetId: entry.id, params: rawParams, x, z, rotation: rot, ...(options.attachTo ? { attachTo: options.attachTo } : {}) });
    if (entry.id.startsWith('an.npc.')) npcSpace.push(fp);
    return id;
  }
  const parentOf = (id: string) => placements.find((p) => p.id === id)!;
  /** A failed gameplay assembly must leave neither scenery nor occupancy/budget behind. */
  function transaction(build: () => boolean): boolean {
    const lists = [placements, anchors, blocks, flats, keep, npcSpace, structures];
    const lengths = lists.map((list) => list.length);
    const saved = { serial, triangles: budget.triangles, drawCalls: budget.drawCalls, instanced: new Set(budget.instanced) };
    if (build()) return true;
    lists.forEach((list, i) => { list.length = lengths[i]!; });
    serial = saved.serial; budget.triangles = saved.triangles; budget.drawCalls = saved.drawCalls; budget.instanced = saved.instanced;
    return false;
  }
  /** Attach an entry to a parent's socket of one of the given kinds; returns the new placement ID. */
  function attach(parentId: string, kinds: readonly string[], candidates: CatalogEntry[], overrides: ParamValues = {}, required = false): string | null {
    const parent = parentOf(parentId);
    const parentEntry = catalogEntry(parent.assetId)!;
    const used = new Set(placements.filter((p) => p.attachTo?.placementId === parentId).map((p) => p.attachTo!.socketId));
    for (const socket of parentEntry.sockets(resolveParams(parentEntry, parent.params))) {
      if (used.has(socket.id) || !kinds.includes(socket.kind)) continue;
      const fits = candidates.filter((entry) => entry.attachesTo?.includes(socket.kind));
      const entry = pick(fits);
      if (!entry) continue;
      const p = rotatePoint(socket.x, socket.z, parent.rotation);
      const x = parent.x + p.x, z = parent.z + p.z;
      const [label, spec] = Object.entries(entry.params).find(([, s]) => s.type === 'text' && (s.catalog === 'shop-name' || s.catalog === 'notice')) ?? [];
      const sign = spec?.type === 'text' && spec.catalog === 'notice' ? pick(['open', 'welcome']) : pick(SHOP_SIGNS[parent.assetId] ?? RETAIL_SIGNS);
      const signed = label && !(label in overrides) ? { ...overrides, [label]: sign! } : overrides;
      const id = place(entry, randomParams(entry, signed), x, z, ((parent.rotation + socket.facing) % 360) as Rot, { attachTo: { placementId: parentId, socketId: socket.id }, required });
      if (id) return id;
    }
    return null;
  }
  const anchorIds = new Map<string, number>();
  const anchorId = (name: string) => { const n = (anchorIds.get(name) ?? 1) + 1; anchorIds.set(name, n); return `c${cx}.${cz}:${name}-${n}`; };
  const addAnchor = (anchor: Anchor) => { anchors.push(anchor); keep.push(square(anchor.x, anchor.z, 0.8)); };

  /** Nearest road or creek to a sidewalk point: the face an item behind it should present, and its lot front line. */
  function frontage(x: number, z: number): { face: Face; front: number } {
    const blockers = [...plan.roads.map((road) => ({ rect: roadRect(road), horizontal: road.from.z === road.to.z })), ...plan.water.filter((w) => w.kind === 'creek').map((w) => ({ rect: w.rect, horizontal: true }))];
    let best = { face: 'n' as Face, front: z, d: Infinity };
    for (const { rect, horizontal } of blockers) {
      const d = horizontal ? (x >= rect.minX - 1 && x <= rect.maxX + 1 ? Math.min(Math.abs(z - rect.minZ), Math.abs(z - rect.maxZ)) : Infinity)
        : (z >= rect.minZ - 1 && z <= rect.maxZ + 1 ? Math.min(Math.abs(x - rect.minX), Math.abs(x - rect.maxX)) : Infinity);
      if (d >= best.d) continue;
      best = horizontal ? (z > rect.maxZ - 1e-6 ? { face: 'n', front: rect.maxZ + SIDEWALK, d } : { face: 's', front: rect.minZ - SIDEWALK, d })
        : (x > rect.maxX - 1e-6 ? { face: 'w', front: rect.maxX + SIDEWALK, d } : { face: 'e', front: rect.minX - SIDEWALK, d });
    }
    return best;
  }
  /** Centre of an item of depth d standing `setback` metres behind a face's front line, at `along`. */
  const behind = (face: Face, front: number, along: number, depth: number) => {
    const f = FACE[face];
    return f.dz !== 0 ? { x: along, z: front - f.dz * depth } : { x: front - f.dx * depth, z: along };
  };

  // ---------------------------------------------------------------- quest anchors

  // Vendors always come with a visible serving stand, rather than a character outside a shop shell.
  const vendorEntries = entries((e) => e.id === 'an.vendor.drink-stall' || e.id === 'an.vendor.cafe-counter');
  const npcVendor = entries((e) => e.id === 'an.npc.vendor' || (e.capabilities.includes('drink-vendor') && e.placement === 'socket'));
  const menuSigns = entries((e) => e.capabilities.includes('readable-sign') && Object.values(e.params).some((p) => p.type === 'text' && p.catalog === 'menu'));
  function vendorAt(standX: number, standZ: number, id: string, nameKey: string, required: boolean): boolean {
    const { face, front } = frontage(standX, standZ);
    const along = FACE[face].dz !== 0 ? standX : standZ;
    // Stand on the sidewalk of the frontage actually found (a lot may face a stub road that ends short).
    ({ x: standX, z: standZ } = behind(face, front, along, -SIDEWALK / 2));
    const order = [...vendorEntries].sort((a, b) => Number(b.districts.includes(district)) - Number(a.districts.includes(district)) || rng() - 0.5);
    for (const entry of order) {
      const params = randomParams(entry);
      const valid = resolved(entry, params);
      if (!valid) continue;
      const c = behind(face, front, along, entry.footprint(valid).d / 2);
      let placementId: string | null = null;
      if (!transaction(() => {
        placementId = place(entry, params, c.x, c.z, FACE[face].rot, { required });
        return Boolean(placementId && attach(placementId, ['npc'], npcVendor, { nameKey }, required));
      })) continue;
      if (!placementId) continue;
      addAnchor({ id, placementId, capability: 'drink-vendor', kind: 'npc', role: 'vendor', nameKey, x: round(standX), z: round(standZ) });
      // A readable menu beside the counter (q1.menu reading evidence).
      const sign = pick(menuSigns);
      if (sign && anchors.length < CITY_LIMITS.maxAnchors) {
        const w = entry.footprint(valid).w / 2 + 0.9;
        for (const side of [1, -1]) {
          const s = behind(face, front, along + side * w, -0.6);
          const signId = place(sign, randomParams(sign), s.x, s.z, FACE[face].rot);
          if (signId) { const p = behind(face, front, along + side * w, -1.7); addAnchor({ id: anchorId('menu'), placementId: signId, capability: 'readable-sign', kind: 'sign', cueId: 'q1.menu', x: round(p.x), z: round(p.z) }); break; }
        }
      }
      return true;
    }
    return false;
  }
  /** Sidewalk NPC (guide/passerby) standing 1.2 m from its stand point, facing it. */
  function figureAt(standX: number, standZ: number, capability: 'direction-helper' | 'photo-passerby', id: string, toward: { dx: number; dz: number } | null, required: boolean, fixedName?: string): boolean {
    const role = capability === 'direction-helper' ? 'guide' : 'passerby';
    let dir = toward;
    if (!dir) { const { face } = frontage(standX, standZ); dir = { dx: -FACE[face].dx, dz: -FACE[face].dz }; }
    const fx = standX + dir.dx * 1.2, fz = standZ + dir.dz * 1.2;
    const facing: Face = dir.dx > 0 ? 'w' : dir.dx < 0 ? 'e' : dir.dz > 0 ? 'n' : 's';
    // Capability also belongs to scenery (the info board), which has no character mesh.
    const figures = entries((e) => e.id === `an.npc.${role}` && e.capabilities.includes(capability));
    for (const entry of figures) {
      const nameKey = fixedName ?? randomName();
      const placementId = place(entry, randomParams(entry, 'nameKey' in entry.params ? { nameKey } : {}), fx, fz, FACE[facing].rot, { onRoad: true, required });
      if (!placementId) continue;
      addAnchor({ id, placementId, capability, kind: 'npc', role, nameKey, x: round(standX), z: round(standZ) });
      if (role === 'guide') {
        const board = pick(entries((e) => e.id === 'an.helper.info-board'));
        const side = FACE[facing].dz !== 0 ? { x: fx + 1.4, z: fz } : { x: fx, z: fz + 1.4 };
        if (board) place(board, randomParams(board), side.x, side.z, FACE[facing].rot, { onRoad: true });
      }
      return true;
    }
    return false;
  }
  function viewpointAt(standX: number, standZ: number, id: string, required: boolean): boolean {
    const river = plan.water.find((w) => w.kind === 'river');
    if (!river) return false;
    const west = standX < river.rect.minX + 1;
    const entry = entries((e) => e.capabilities.includes('river-viewpoint'))[0];
    if (!entry) return false;
    const params = randomParams(entry);
    const valid = resolved(entry, params);
    if (!valid) return false;
    const rot: Rot = west ? 90 : 270;
    const x = west ? river.rect.minX : river.rect.maxX;
    // Keep the deck clear of promenade props; the photo-spot socket is the stand point.
    keep.push(shift(rotateRect({ minX: -entry.footprint(valid).w / 2 - 0.5, maxX: entry.footprint(valid).w / 2 + 0.5, minZ: -2.5, maxZ: 0 }, rot), x, standZ));
    const placementId = place(entry, params, x, standZ, rot, { required });
    if (!placementId) return false;
    const socket = entry.sockets(valid).find((s) => s.id === 'photo-spot') ?? { x: 0, z: 0.6 };
    const p = rotatePoint(socket.x, socket.z, rot);
    anchors.push({ id, placementId, capability: 'river-viewpoint', kind: 'photo-spot', nameKey: 'huangpu', x: round(x + p.x), z: round(standZ + p.z) });
    return true;
  }

  for (const required of plan.requiredAnchors) {
    const near = required.near ?? { x: CHUNK_SIZE / 2, z: CHUNK_SIZE / 2 };
    switch (required.capability) {
      case 'drink-vendor': vendorAt(near.x, near.z, required.anchorId, required.nameKey ?? randomName(), true); break;
      case 'direction-helper': figureAt(near.x, near.z, 'direction-helper', required.anchorId, null, true, required.nameKey); break;
      case 'river-viewpoint': viewpointAt(near.x, near.z, required.anchorId, true); break;
      case 'photo-passerby': {
        const river = plan.water.find((w) => w.kind === 'river');
        figureAt(near.x, near.z, 'photo-passerby', required.anchorId, river && near.x < river.rect.minX ? { dx: 1, dz: 0 } : { dx: -1, dz: 0 }, true); break;
      }
      case 'hotel-landmark': {
        const entry = catalogEntry('an.hotel.grand');
        if (!approved(entry)) break;
        const { face, front } = frontage(near.x, near.z);
        const along = FACE[face].dz !== 0 ? near.x : near.z;
        for (const params of [randomParams(entry), {}]) {
          const valid = resolved(entry, params);
          if (!valid) continue;
          const c = behind(face, front, along, entry.footprint(valid).d / 2);
          const placementId = place(entry, params, c.x, c.z, FACE[face].rot, { required: true });
          if (placementId) { addAnchor({ id: required.anchorId, placementId, capability: 'hotel-landmark', kind: 'landmark', nameKey: 'grand-hotel', x: round(near.x), z: round(near.z) }); break; }
        }
        break;
      }
      case 'readable-sign': break;
    }
  }
  const requiredKinds = new Set(plan.requiredAnchors.map((a) => a.capability));

  // ---------------------------------------------------------------- waterfront and creek edges

  const river = plan.water.find((w) => w.kind === 'river');
  if (river && !requiredKinds.has('river-viewpoint') && anchors.length < CITY_LIMITS.maxAnchors - 1 && rng() < Math.min(1, 0.5 * weight('river-viewpoint'))) {
    const west = river.rect.minX > 0;
    const edge = west ? river.rect.minX : river.rect.maxX;
    const z = 6 + rng() * 26;
    if (!plan.bridges.some((b) => Math.abs((b.rect.minZ + b.rect.maxZ) / 2 - z) < 9)) {
      const id = anchorId('viewpoint');
      if (viewpointAt(west ? edge + 0.6 : edge - 0.6, z, id, false) && rng() < Math.min(1, 0.8 * weight('photo-passerby'))) {
        figureAt(west ? edge - 2.2 : edge + 2.2, z + 5.5, 'photo-passerby', anchorId('passerby'), west ? { dx: 1, dz: 0 } : { dx: -1, dz: 0 }, false);
      }
    }
  }
  const lots = computeLots(plan.roads, plan.water);
  // Place optional NPCs before waterfront decorations and buildings.
  const facing = lots.filter((lot) => lot.faces.length);
  if (!requiredKinds.has('drink-vendor') && facing.length && rng() < Math.min(1, VENDOR_BASE[district] * weight('drink-vendor'))) {
    const lot = pick(facing)!, face = pick(lot.faces)!;
    const span = FACE[face].dz !== 0 ? [lot.rect.minX + 3, lot.rect.maxX - 3] : [lot.rect.minZ + 3, lot.rect.maxZ - 3];
    if (span[1]! > span[0]!) {
      const along = span[0]! + rng() * (span[1]! - span[0]!);
      const front = frontLine(lot.rect, face);
      const stand = behind(face, front, along, -SIDEWALK / 2);
      vendorAt(stand.x, stand.z, anchorId('vendor'), randomName(), false);
    }
  }
  if (!requiredKinds.has('direction-helper') && district !== 'industrial' && facing.length && rng() < Math.min(1, 0.3 * weight('direction-helper'))) {
    const lot = pick(facing)!, face = pick(lot.faces)!;
    const along = FACE[face].dz !== 0 ? (lot.rect.minX + lot.rect.maxX) / 2 : (lot.rect.minZ + lot.rect.maxZ) / 2;
    const stand = behind(face, frontLine(lot.rect, face), along, -0.6);
    figureAt(stand.x, stand.z, 'direction-helper', anchorId('guide'), null, false);
  }


  const railing = entries((e) => e.id === 'wf.railing')[0] ?? entries((e) => e.category === 'waterfront' && e.placement === 'water-edge' && e.attachesTo === undefined && e.collision(resolveParams(e)).walkable.length === 0)[0];
  const lengthParam = railing && Object.entries(railing.params).find(([, spec]) => spec.type === 'number' && spec.max >= 10)?.[0];
  /** Railings straddle a water edge, skipping bridges and kept zones. */
  function edgeRailings(axis: 'x' | 'z', line: number, from: number, to: number, gaps: [number, number][], rot: Rot) {
    if (!railing || !lengthParam) return;
    const spec = railing.params[lengthParam]!;
    if (spec.type !== 'number') return;
    const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
    let cursor = from;
    const runs: [number, number][] = [];
    for (const [g0, g1] of sorted) { if (g0 > cursor) runs.push([cursor, g0]); cursor = Math.max(cursor, g1); }
    if (cursor < to) runs.push([cursor, to]);
    for (const [a, b] of runs) {
      for (let s = a; b - s >= spec.min + 0.4; ) {
        const length = Math.min(spec.max, b - s - 0.4, 10);
        if (length < spec.min) break;
        const mid = s + 0.2 + length / 2;
        place(railing, { ...randomParams(railing), [lengthParam]: round(length) }, axis === 'z' ? line : mid, axis === 'z' ? mid : line, rot);
        s += length + 0.4;
      }
    }
  }
  const keptAlong = (axis: 'x' | 'z') => keep.map((k) => (axis === 'z' ? [k.minZ - 0.6, k.maxZ + 0.6] : [k.minX - 0.6, k.maxX + 0.6]) as [number, number]);
  if (river) {
    const west = river.rect.minX > 0;
    const creek = plan.water.find((w) => w.kind === 'creek');
    const gaps: [number, number][] = [...plan.bridges.filter((b) => b.axis === 'x').map((b) => [b.rect.minZ - 0.8, b.rect.maxZ + 0.8] as [number, number]), ...(creek ? [[creek.rect.minZ - 0.6, creek.rect.maxZ + 0.6] as [number, number]] : []), ...keptAlong('z')];
    edgeRailings('z', west ? river.rect.minX : river.rect.maxX, 0, CHUNK_SIZE, gaps, west ? 90 : 270);
    const boat = entries((e) => e.placement === 'water' && e.category === 'waterfront' && !e.id.includes('bridge'))[0];
    if (boat) for (let i = 0; i < 2; i++) place(boat, randomParams(boat), (river.rect.minX + river.rect.maxX) / 2, 4 + rng() * 32, rng() < 0.5 ? 90 : 270);
  }
  for (const creek of plan.water.filter((w) => w.kind === 'creek')) {
    const gaps: [number, number][] = [...plan.bridges.filter((b) => b.axis === 'z').map((b) => [b.rect.minX - 0.8, b.rect.maxX + 0.8] as [number, number]), ...keptAlong('x')];
    edgeRailings('x', creek.rect.minZ, creek.rect.minX, creek.rect.maxX, gaps, 0);
    edgeRailings('x', creek.rect.maxZ, creek.rect.minX, creek.rect.maxX, gaps, 180);
  }

  // ---------------------------------------------------------------- lots and frontage

  const buildings = entries((e) => e.category === 'building' && e.placement === 'ground' && e.districts.includes(district) && !/wall|gate/.test(e.id));
  const frontageExtras = entries((e) => e.id === 'st.metro.entrance' && e.districts.includes(district));
  const modules = entries((e) => e.category === 'storefront' && e.placement === 'socket' && e.collision(resolveParams(e)).solids.length === 0 && e.districts.includes(district));
  const weighted = (list: CatalogEntry[]) => list.flatMap((e) => (KIT[district].test(e.id) ? [e, e, e] : [e]));
  const kit = weighted(buildings);

  for (const lot of lots) {
    if (district === 'park') { parkFill(lot.rect); continue; }
    const face = lot.faces.find((f) => f === 'n' || f === 's') ?? lot.faces[0] ?? 's';
    const front = frontLine(lot.rect, face);
    const [start, end] = FACE[face].dz !== 0 ? [lot.rect.minX, lot.rect.maxX] : [lot.rect.minZ, lot.rect.maxZ];
    const depth = FACE[face].dz !== 0 ? lot.rect.maxZ - lot.rect.minZ : lot.rect.maxX - lot.rect.minX;
    let cursor = start + rng() * 0.8, deepest = 0, metro = false;
    while (cursor < end - 2.5 && kit.length) {
      let placed = false;
      for (let attempt = 0; attempt < 16 && !placed; attempt++) {
        const useMetro: boolean = !metro && frontageExtras.length > 0 && rng() < 0.08;
        const entry = useMetro ? frontageExtras[0]! : pick(kit)!;
        const params = randomParams(entry);
        // Fit variable footprints to the remaining lot before rejecting the candidate.
        // Random full-size widths/depths otherwise leave narrow outer-city lots empty.
        for (const [key, available] of [['width', end - cursor], ['depth', depth]] as const) {
          const spec = entry.params[key];
          if (!spec || (spec.type !== 'number' && spec.type !== 'int')) continue;
          const step = spec.type === 'int' ? 1 : spec.step;
          const maximum = step ? round(spec.min + Math.floor((available - spec.min) / step) * step) : round(Math.floor(available * 100) / 100);
          if (maximum >= spec.min) params[key] = Math.min(params[key] as number, maximum);
        }
        const valid = resolved(entry, params);
        if (!valid) continue;
        const { w, d } = entry.footprint(valid);
        if (w > end - cursor || d > depth) continue;
        const c = behind(face, front, cursor + w / 2, d / 2);
        const id = place(entry, params, c.x, c.z, FACE[face].rot);
        if (!id) continue;
        placed = true; metro ||= Boolean(useMetro);
        deepest = Math.max(deepest, d);
        if (rng() < ATTACH_P[district]) for (let k = 0; k < 4; k++) if (!attach(id, ['storefront', 'door', 'window', 'sign', 'awning', 'lamp', 'balcony'], modules)) break;
        cursor += w + entry.clearance.side * 2 + 0.25;
      }
      if (!placed) cursor += 1;
    }
    // Interior behind the street row: courtyards, trees, quieter residential blocks.
    const inner = innerRect(lot.rect, face, deepest + 1);
    if (inner) interiorFill(inner, face);
  }

  function parkFill(rect: Rect) {
    const lawn = entries((e) => e.id === 'ls.park.lawn')[0];
    if (lawn) {
      const w = Math.min(20, rect.maxX - rect.minX - 1), d = Math.min(20, rect.maxZ - rect.minZ - 1);
      if (w >= 4 && d >= 4) place(lawn, { ...randomParams(lawn), width: round(w), depth: round(d) }, (rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2, 0);
    }
    const features = entries((e) => e.category === 'landscape' && e.districts.includes('park') && e.id !== 'ls.park.lawn' && e.id !== 'ls.courtyard.tiles');
    arrangeFeatures(rect, features, 10, 's');
    arrangeFeatures(rect, entries((e) => e.id === 'st.bench' || e.id === 'st.lamp.lantern-post'), 3, 's');
  }
  function interiorFill(rect: Rect, face: Face) {
    // Fill block interiors with aligned rows; greenery belongs to parks and sidewalk slots.
    for (let z = rect.minZ + 4; z < rect.maxZ - 3; z += 9) {
      for (let x = rect.minX + 3; x < rect.maxX - 2; x += 6) {
        for (const entry of kit.filter((e) => /shop.twostory|restaurant.noodle/.test(e.id))) {
          const params = randomParams(entry, { width: 4 });
          const valid = resolved(entry, params);
          if (!valid) continue;
          const f = entry.footprint(valid);
          const [w, d] = FACE[face].dz !== 0 ? [f.w, f.d] : [f.d, f.w];
          if (x - w / 2 < rect.minX || x + w / 2 > rect.maxX || z - d / 2 < rect.minZ || z + d / 2 > rect.maxZ) continue;
          if (place(entry, params, x, z, FACE[face].rot)) break;
        }
      }
    }
  }
  /** Authored park grid: clear paths between rows, with furniture at fixed stations. */
  function arrangeFeatures(rect: Rect, list: CatalogEntry[], count: number, face: Face) {
    if (!list.length) return;
    let placed = 0, station = 0;
    for (let z = rect.minZ + 3; z <= rect.maxZ - 3 && placed < count; z += 6) {
      for (let x = rect.minX + 3; x <= rect.maxX - 3 && placed < count; x += 6) {
        const entry = list[station++ % list.length]!;
        if (place(entry, randomParams(entry), x, z, FACE[face].rot)) placed++;
      }
    }
  }

  // ---------------------------------------------------------------- sidewalk furniture

  const props = entries((e) => (e.category === 'street' || e.category === 'landscape') && e.placement === 'sidewalk' && e.districts.includes(district) && e.capabilities.length === 0 && e.collision(resolveParams(e)).solids.length > 0);
  const stationKits = [/^ls\.tree/, /lamp/, /bench|bikerack|sharedbikes/, /^ls\.tree/].map((pattern) => props.filter((e) => pattern.test(e.id)));
  const named = (e: CatalogEntry) => Object.entries(e.params).find(([, spec]) => spec.type === 'text' && spec.catalog === 'road-name')?.[0];
  plan.roads.forEach((road, index) => sidewalk(road, index));
  function sidewalk(road: Road, index: number) {
    const rect = roadRect(road), horizontal = road.from.z === road.to.z;
    const others = plan.roads.filter((_, i) => i !== index).map(roadRect);
    const [a, b] = horizontal ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ];
    for (const side of [-1, 1] as const) {
      const face: Face = horizontal ? (side < 0 ? 's' : 'n') : (side < 0 ? 'e' : 'w');
      const line = horizontal ? (side < 0 ? rect.minZ - 0.7 : rect.maxZ + 0.7) : (side < 0 ? rect.minX - 0.7 : rect.maxX + 0.7);
      for (let s = a + 4; s < b - 2; s += 8) {
        const x = horizontal ? s : line, z = horizontal ? line : s;
        if (others.some((r) => overlaps(square(x, z, 2.5), r))) continue;
        const slot = Math.floor((s - a) / 8);
        const candidates = stationKits[slot % stationKits.length]!;
        const entry = candidates[(index + slot) % candidates.length] ?? props[slot % props.length];
        if (!entry) return;
        const roadKey = named(entry);
        place(entry, randomParams(entry, roadKey && road.nameKey ? { [roadKey]: road.nameKey } : {}), x, z, FACE[face].rot);
      }
    }
  }
  // Zebra crossings where streets meet.
  const zebra = entries((e) => e.id === 'st.crossing.zebra')[0];
  if (zebra) for (const road of plan.roads.filter((r) => r.from.x === r.to.x)) {
    const ns = roadRect(road);
    for (const ew of plan.roads.filter((r) => r.from.z === r.to.z).map(roadRect)) {
      for (const z of [ew.minZ - 2, ew.maxZ + 2]) if (z > ns.minZ + 1.5 && z < ns.maxZ - 1.5) place(zebra, { ...randomParams(zebra), width: Math.min(16, Math.max(2, road.width)), depth: 3 }, road.from.x, z, 0);
    }
  }

  const manifest = sealManifest({
    worldId, coord: { cx, cz }, district, catalogVersion: CATALOG_VERSION, generatorVersion: GENERATOR_VERSION, seed,
    source: 'fallback', questContext, connectors: plan.connectors, roads: plan.roads, water: plan.water, bridges: plan.bridges,
    placements, anchors, missingCapabilities: [],
  });
  // Safety net: optional pieces that the local checks missed (e.g. an anchor on a lot cut off by a
  // creek) are dropped deterministically; required anchors are never dropped.
  if (validateManifest(manifest, plan).ok) return manifest;
  const repaired = repairManifest(manifest, plan);
  if (repaired && validateManifest(repaired, plan).ok) return repaired;
  throw new Error(`Fallback city generation failed validation for ${worldId} chunk ${cx},${cz}`);
}

function frontLine(rect: Rect, face: Face): number {
  return face === 'n' ? rect.minZ : face === 's' ? rect.maxZ : face === 'w' ? rect.minX : rect.maxX;
}
function innerRect(rect: Rect, face: Face, used: number): Rect | null {
  const r = { ...rect };
  if (face === 'n') r.minZ += used; else if (face === 's') r.maxZ -= used; else if (face === 'w') r.minX += used; else r.maxX -= used;
  return r.maxX - r.minX >= 4 && r.maxZ - r.minZ >= 4 ? r : null;
}
/** Free land between road/creek bands (with sidewalks) and river water; faces point at an adjacent band. */
function computeLots(roads: Road[], water: { kind: string; rect: Rect }[]): Lot[] {
  const xBands: [number, number][] = [], zBands: [number, number][] = [];
  for (const road of roads) {
    const r = roadRect(road);
    if (road.from.x === road.to.x) xBands.push([r.minX - SIDEWALK, r.maxX + SIDEWALK]); else zBands.push([r.minZ - SIDEWALK, r.maxZ + SIDEWALK]);
  }
  for (const w of water) {
    if (w.kind === 'river') xBands.push([w.rect.minX - 0.5, w.rect.maxX + 0.5]);
    else zBands.push([w.rect.minZ - SIDEWALK, w.rect.maxZ + SIDEWALK]);
  }
  const free = (bands: [number, number][]) => {
    const out: [number, number][] = [];
    let cursor = 0;
    for (const [a, b] of [...bands].sort((p, q) => p[0] - q[0])) { if (a - cursor >= 4) out.push([cursor, Math.max(cursor, a)]); cursor = Math.max(cursor, b); }
    if (CHUNK_SIZE - cursor >= 4) out.push([cursor, CHUNK_SIZE]);
    return out;
  };
  const xs = free(xBands), zs = free(zBands);
  return xs.flatMap(([minX, maxX]) => zs.map(([minZ, maxZ]) => {
    const faces: Face[] = [];
    if (minZ > 1e-6) faces.push('n');
    if (maxZ < CHUNK_SIZE - 1e-6) faces.push('s');
    if (minX > 1e-6 && xBands.some(([, b]) => Math.abs(b - minX) < 1e-6 && !water.some((w) => w.kind === 'river' && Math.abs(w.rect.maxX + 0.5 - b) < 1e-6))) faces.push('w');
    if (maxX < CHUNK_SIZE - 1e-6 && xBands.some(([a]) => Math.abs(a - maxX) < 1e-6 && !water.some((w) => w.kind === 'river' && Math.abs(w.rect.minX - 0.5 - a) < 1e-6))) faces.push('e');
    return { rect: { minX, maxX, minZ, maxZ }, faces };
  }));
}
