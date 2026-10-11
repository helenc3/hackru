import { z } from 'zod';
import { DirectionsSchema, MissionIdSchema, NpcIdSchema, PositionSchema, QuestCategorySchema, ZoneIdSchema, CueIdSchema, type Directions, type Position, type QuestCategory, type ZoneId } from '../contracts.js';

// Frozen city contracts (docs/CITY_GENERATION.md, proposals/city-streaming-contracts.md).
// One chunk manifest is consumed by server movement validation and client rendering.

export const CHUNK_SIZE = 40;
/** The 3 × 3 spawn box: generated once per world, pinned in the cache, never regenerated. */
export const SPAWN_RADIUS_CHUNKS = 1;
export const VISIBLE_RADIUS_CHUNKS = 1;
export const PREFETCH_RADIUS_CHUNKS = 2;
export const GENERATOR_VERSION = 1;
export const CITY_LIMITS = { maxPlacements: 160, maxAnchors: 12, maxRoads: 24, maxWater: 8, maxBridges: 4, maxTriangles: 120_000, maxDrawCalls: 400 } as const;
/** deadlineMs started at 8 s; a measured live claude-opus-5-5 chunk took ~12 s (27k input / 1k output tokens), so prefetch waits 20 s. Urgent requests still commit a seeded fallback immediately. */
export const GENERATION_RULES = { concurrency: 2, deadlineMs: 20_000, retries: 1, batchSize: 6, sessionCallCap: 60, sessionTokenCap: 400_000 } as const;
/** CITY_GENERATION §8: boost after ~3 active minutes or 6 newly visited chunks without an encounter, capped at 1.5×. */
export const BIAS_RULES = { absenceMs: 180_000, absenceChunks: 6, maxBoost: 1.5, encounterRadius: 8 } as const;
/** Guaranteed reachable quest opportunities within this many chunks (Chebyshev) of spawn. */
export const EXPLORATION_BUDGET_CHUNKS = 4;

export const DistrictKindSchema = ZoneIdSchema;
export type DistrictKind = ZoneId;
/** Gameplay defaults, not Shanghai zoning statistics. Water corridors are reserved separately. */
export const DISTRICT_TARGETS: Record<DistrictKind, number> = { shopping: 0.35, historic: 0.25, residential: 0.15, waterfront: 0.10, park: 0.08, office: 0.05, industrial: 0.02 };

const int = z.number().int();
const local = z.number().finite().min(0).max(CHUNK_SIZE);
const id = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const ChunkCoordSchema = z.strictObject({ cx: int.min(-250).max(249), cz: int.min(-250).max(249) });
export type ChunkCoord = z.infer<typeof ChunkCoordSchema>;
export const chunkKey = ({ cx, cz }: ChunkCoord): string => `${cx},${cz}`;
export const chunkOf = (p: Position): ChunkCoord => ({ cx: Math.floor(p.x / CHUNK_SIZE), cz: Math.floor(p.z / CHUNK_SIZE) });
export const chunkOrigin = ({ cx, cz }: ChunkCoord): Position => ({ x: cx * CHUNK_SIZE, z: cz * CHUNK_SIZE });
export const inSpawnBox = ({ cx, cz }: ChunkCoord): boolean => Math.abs(cx) <= SPAWN_RADIUS_CHUNKS && Math.abs(cz) <= SPAWN_RADIUS_CHUNKS;

/** Axis-aligned rectangle in chunk-local (0..40) or world coordinates, stated per use. */
export const RectSchema = z.strictObject({ minX: z.number().finite(), maxX: z.number().finite(), minZ: z.number().finite(), maxZ: z.number().finite() }).refine((r) => r.minX < r.maxX && r.minZ < r.maxZ, 'Rect requires positive area.');
export type Rect = z.infer<typeof RectSchema>;

// ---------------------------------------------------------------- catalog

export const AssetCategorySchema = z.enum(['building', 'storefront', 'street', 'landscape', 'waterfront', 'anchor']);
export type AssetCategory = z.infer<typeof AssetCategorySchema>;
/** Prefixes: bld. building · sf. storefront module · st. street · ls. landscape · wf. waterfront · an. interaction anchor. */
export const AssetIdSchema = z.string().regex(/^(bld|sf|st|ls|wf|an)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(64);
export type AssetId = z.infer<typeof AssetIdSchema>;
export const ParamSpecSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('number'), min: z.number().finite(), max: z.number().finite(), default: z.number().finite(), step: z.number().positive().optional(), description: z.string().max(120) }),
  z.strictObject({ type: z.literal('int'), min: int, max: int, default: int, description: z.string().max(120) }),
  z.strictObject({ type: z.literal('enum'), values: z.array(z.string().max(40)).min(1).max(16), default: z.string().max(40), description: z.string().max(120) }),
  z.strictObject({ type: z.literal('boolean'), default: z.boolean(), description: z.string().max(120) }),
  /** Text is never free-form: it selects a key from the human-reviewed Simplified Chinese text catalog (./text-catalog.ts). */
  z.strictObject({ type: z.literal('text'), catalog: z.enum(['shop-name', 'road-name', 'menu', 'landmark', 'npc-name', 'notice']), default: z.string().max(40), description: z.string().max(120) }),
]);
export type ParamSpec = z.infer<typeof ParamSpecSchema>;
export const ParamValueSchema = z.union([z.number().finite(), z.string().max(40), z.boolean()]);
export type ParamValues = Record<string, z.infer<typeof ParamValueSchema>>;
export const SocketKindSchema = z.enum(['storefront', 'door', 'window', 'awning', 'sign', 'roof', 'counter', 'npc', 'lamp', 'balcony', 'railing']);
export type SocketKind = z.infer<typeof SocketKindSchema>;
export const SocketSchema = z.strictObject({ id: id, kind: SocketKindSchema, x: z.number().finite(), y: z.number().finite(), z: z.number().finite(), facing: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) });
export type Socket = z.infer<typeof SocketSchema>;
export const PlacementRuleSchema = z.enum(['ground', 'road', 'sidewalk', 'water', 'water-edge', 'socket']);
export const CapabilitySchema = z.enum(['drink-vendor', 'direction-helper', 'hotel-landmark', 'river-viewpoint', 'photo-passerby', 'readable-sign']);
export type Capability = z.infer<typeof CapabilitySchema>;
/** Collision shape in entry-local coordinates (origin at footprint centre, before rotation). */
export type CollisionShape = { solids: Rect[]; walkable: Rect[] };

/**
 * One catalog entry. Geometry functions are pure and shared, so render geometry, client
 * prediction, and server collision all derive from the same validated parameters.
 */
export interface CatalogEntry {
  id: AssetId;
  version: number;
  /** Name of the React Three Fiber component in apps/web/src/city/assets that renders it. */
  component: string;
  category: AssetCategory;
  description: string;
  districts: readonly DistrictKind[];
  params: Readonly<Record<string, ParamSpec>>;
  placement: z.infer<typeof PlacementRuleSchema>;
  /** Socket kinds this entry may attach to (placement 'socket' only). */
  attachesTo?: readonly SocketKind[];
  /** Footprint width (x) and depth (z) in metres for validated params, before rotation. */
  footprint(params: ParamValues): { w: number; d: number; h: number };
  collision(params: ParamValues): CollisionShape;
  sockets(params: ParamValues): readonly Socket[];
  /** Metres kept clear of other solids in front (+z local) and at the sides. */
  clearance: { front: number; side: number };
  capabilities: readonly Capability[];
  lod: { levels: 1 | 2 | 3; cullDistance: number };
  cost: { triangles: number; drawCalls: number; instanced: boolean };
  /** Reviewer state from the gallery; only approved entries are offered to generation. */
  review: 'pending' | 'approved';
}

// ---------------------------------------------------------------- manifest

/** Degrees about three.js rotation.y (counter-clockwise seen from above), applied after the entry-local footprint. */
export const RotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
export const PlacementSchema = z.strictObject({
  id: id, assetId: AssetIdSchema, params: z.record(z.string().max(40), ParamValueSchema),
  /** Chunk-local centre. */
  x: local, z: local, rotation: RotationSchema,
  attachTo: z.strictObject({ placementId: id, socketId: id }).optional(),
});
export type Placement = z.infer<typeof PlacementSchema>;
export const RoadKindSchema = z.enum(['avenue', 'street', 'lane', 'promenade']);
/** Axis-aligned road centre-line segment in chunk-local coordinates. */
export const RoadSchema = z.strictObject({ id: id, kind: RoadKindSchema, from: z.strictObject({ x: local, z: local }), to: z.strictObject({ x: local, z: local }), width: z.number().min(2).max(16), nameKey: z.string().max(40).optional() }).refine((road) => road.from.x === road.to.x || road.from.z === road.to.z, 'Roads are axis-aligned.');
export type Road = z.infer<typeof RoadSchema>;
export const WaterSchema = z.strictObject({ id: id, kind: z.enum(['river', 'creek']), rect: RectSchema });
export type Water = z.infer<typeof WaterSchema>;
export const BridgeSchema = z.strictObject({ id: id, assetId: AssetIdSchema, rect: RectSchema, axis: z.enum(['x', 'z']) });
export type Bridge = z.infer<typeof BridgeSchema>;
/** An interaction anchor bound to a placement whose catalog entry grants the capability. */
export const AnchorSchema = z.strictObject({
  id: id, placementId: id, capability: CapabilitySchema, kind: z.enum(['npc', 'sign', 'landmark', 'photo-spot']),
  role: NpcIdSchema.optional(), nameKey: z.string().max(40).optional(), cueId: CueIdSchema.optional(),
  /** Chunk-local position the player stands at to interact. */
  x: local, z: local,
});
export type Anchor = z.infer<typeof AnchorSchema>;
/** north = −z (neighbour cz−1, local z = 0) · south = +z (cz+1, z = 40) · west = −x (cx−1, x = 0) · east = +x (cx+1, x = 40). Connector offset runs along the edge in +x (north/south) or +z (east/west). */
export const EdgeSchema = z.enum(['north', 'east', 'south', 'west']);
export type Edge = z.infer<typeof EdgeSchema>;
/** A deterministic crossing on a chunk edge; both neighbours derive identical connectors from the seed. */
export const ConnectorSchema = z.strictObject({ edge: EdgeSchema, kind: z.enum(['avenue', 'street', 'lane', 'promenade', 'river', 'creek']), offset: local, width: z.number().min(2).max(40) });
export type Connector = z.infer<typeof ConnectorSchema>;
/** weights holds all five QuestCategory keys (zod enum records are exhaustive). */
export const QuestContextSnapshotSchema = z.strictObject({ missionId: MissionIdSchema, weights: z.record(QuestCategorySchema, z.number().min(0).max(1.5)) });
export type QuestContextSnapshot = z.infer<typeof QuestContextSnapshotSchema>;
export const ManifestSourceSchema = z.enum(['claude', 'fallback', 'fixture']);
export const ChunkManifestSchema = z.strictObject({
  worldId: id, coord: ChunkCoordSchema, district: DistrictKindSchema,
  catalogVersion: z.string().max(40), generatorVersion: int.min(1), seed: z.string().max(40),
  source: ManifestSourceSchema, questContext: QuestContextSnapshotSchema,
  connectors: z.array(ConnectorSchema).max(16),
  roads: z.array(RoadSchema).max(CITY_LIMITS.maxRoads), water: z.array(WaterSchema).max(CITY_LIMITS.maxWater), bridges: z.array(BridgeSchema).max(CITY_LIMITS.maxBridges),
  placements: z.array(PlacementSchema).max(CITY_LIMITS.maxPlacements), anchors: z.array(AnchorSchema).max(CITY_LIMITS.maxAnchors),
  /** Development proposals reported by Claude; never executable. */
  missingCapabilities: z.array(z.string().max(200)).max(8),
  /** sha256 hex of the canonical manifest without this field (./hash.ts). */
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ChunkManifest = z.infer<typeof ChunkManifestSchema>;

/** What the regional planner fixes before a chunk is composed (CITY_GENERATION §3, §7, §8). */
export interface ChunkPlan {
  coord: ChunkCoord;
  district: DistrictKind;
  connectors: Connector[];
  /** Planner-owned water and major roads, chunk-local. Generators must keep them exactly. */
  water: Water[];
  roads: Road[];
  /** Level bridges where planner roads cross planner water. */
  bridges: Bridge[];
  /** Anchors that must exist in this chunk (deterministic quest guarantees: hotel, spawn vendor/helper, river viewpoint/passerby). */
  requiredAnchors: { capability: Capability; anchorId: string; near?: { x: number; z: number }; /** Quest-giver name (npc-name catalog key), e.g. 老王 / 小李. */ nameKey?: string }[];
  /** Neighbouring districts for gradual transitions. */
  neighbours: Record<Edge, DistrictKind | 'water'>;
}

/** Collision and walkability derived from a committed manifest + catalog, in world coordinates. */
export interface ChunkCollision { key: string; solids: Rect[]; walkable: Rect[]; water: Rect[] }

/** Read-only view of committed world state handed to the pure engine by the server. */
export interface WorldView {
  worldId: string;
  /** Committed and walkable for the whole player circle (WORLD_RULES.playerRadius): inside committed chunks, clear of solids, and off water unless on a walkable deck. */
  walkable(position: Position): boolean;
  committed(coord: ChunkCoord): boolean;
  districtAt(position: Position): DistrictKind;
  anchor(anchorId: string): (Anchor & { position: Position; chunk: string }) | undefined;
  anchorsNear(position: Position, radius: number): (Anchor & { position: Position; chunk: string })[];
  /** Verified route from an anchor to the reserved hotel over the committed/planned street graph; null if none. */
  directionsToHotel(fromAnchorId: string): Directions | null;
}

// ---------------------------------------------------------------- API

export const WorldInfoSchema = z.strictObject({ worldId: id, seed: z.string().max(40), generatorVersion: int, catalogVersion: z.string().max(40), spawn: PositionSchema, hotelAnchorId: id });
export type WorldInfo = z.infer<typeof WorldInfoSchema>;
/** POST /api/sessions/:id/chunks — request committed manifests; urgent commits a seeded fallback for anything not ready. */
export const ChunkRequestSchema = z.strictObject({ coords: z.array(ChunkCoordSchema).min(1).max(GENERATION_RULES.batchSize), urgent: z.boolean().default(false) });
export type ChunkRequest = z.input<typeof ChunkRequestSchema>;
export const ChunkResponseSchema = z.strictObject({ chunks: z.array(ChunkManifestSchema), pending: z.array(ChunkCoordSchema) });
export type ChunkResponse = z.infer<typeof ChunkResponseSchema>;
/** POST /api/sessions/:id/chunks/restore — client IndexedDB manifests; server re-validates before accepting. */
export const ChunkRestoreRequestSchema = z.strictObject({ chunks: z.array(ChunkManifestSchema).min(1).max(25) });
export const ChunkRestoreResponseSchema = z.strictObject({ accepted: z.array(z.string()), rejected: z.array(z.strictObject({ key: z.string(), reason: z.string().max(240) })), chunks: z.array(ChunkManifestSchema) });
export type ChunkRestoreResponse = z.infer<typeof ChunkRestoreResponseSchema>;

export type { Directions, QuestCategory };
export { DirectionsSchema };
