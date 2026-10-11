import { randomUUID } from 'node:crypto';
import {
  CATALOG_VERSION, ChunkManifestSchema, GENERATION_RULES, GENERATOR_VERSION, chunkKey, createWorldView, generateFallbackChunk, inSpawnBox,
  planChunk, repairManifest, sealManifest, seedFromWorldId, validateManifest, verifyManifestHash, worldLayout,
  type ChunkCoord, type ChunkManifest, type ChunkResponse, type ChunkRestoreResponse, type Edge, type QuestContextSnapshot, type WorldInfo, type WorldView,
} from '@vibequest/shared';
import { HttpError } from '../errors.js';
import type { CityComposer, ComposeDraft, ComposeInput } from './claude-city.js';

export interface WorldService {
  open(worldId?: string): WorldInfo;
  view(worldId: string): WorldView;
  /** allowClaude is false for fixture sessions; the seeded generator then builds every chunk. */
  request(sessionId: string, worldId: string, coords: ChunkCoord[], urgent: boolean, questContext: QuestContextSnapshot, allowClaude?: boolean): Promise<ChunkResponse>;
  restore(worldId: string, manifests: ChunkManifest[]): ChunkRestoreResponse;
  readonly provider: 'claude' | 'fallback';
}
export interface WorldServiceOptions {
  /** Present only when Claude city composition is enabled and configured. */
  composer?: CityComposer;
  rules?: Partial<Record<keyof typeof GENERATION_RULES, number>>;
  log?: (entry: Record<string, unknown>) => void;
}

type World = { info: WorldInfo; manifests: Map<string, ChunkManifest>; view?: WorldView };
type Job = { promise: Promise<ChunkManifest> };
const NEIGHBOURS: [Edge, number, number][] = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]];

export function createWorldService(options: WorldServiceOptions = {}): WorldService {
  const rules: Record<keyof typeof GENERATION_RULES, number> = { ...GENERATION_RULES, ...options.rules };
  const log = options.log ?? ((entry) => console.info(JSON.stringify({ city: 'chunk', ...entry })));
  // Authoritative process-local terrain store, matching session lifetime. Clients stream cached commits on demand.
  const worlds = new Map<string, World>();
  const jobs = new Map<string, Job>();
  const usage = new Map<string, { calls: number; tokens: number }>();
  const stats = { claude: 0, fallback: 0 };
  let active = 0;
  const waiters: (() => void)[] = [];
  const acquire = async () => { while (active >= rules.concurrency) await new Promise<void>((resolve) => waiters.push(resolve)); active++; };
  const release = () => { active--; waiters.shift()?.(); };

  function world(worldId: string): World {
    const found = worlds.get(worldId);
    if (!found) throw new HttpError(404, 'WORLD_NOT_FOUND', 'Open the world before requesting chunks.');
    return found;
  }
  function commit(target: World, manifest: ChunkManifest, latencyMs: number, errors: string[] = []): ChunkManifest {
    const key = chunkKey(manifest.coord);
    const existing = target.manifests.get(key);
    if (existing) return existing; // Revealed layouts never change; a late result is discarded.
    target.manifests.set(key, manifest);
    target.view = undefined;
    stats[manifest.source === 'claude' ? 'claude' : 'fallback']++;
    log({ key, source: manifest.source, latencyMs, pinned: inSpawnBox(manifest.coord), errors: errors.slice(0, 5), fallbackRate: Number((stats.fallback / (stats.claude + stats.fallback)).toFixed(3)) });
    return manifest;
  }
  const fallback = (target: World, coord: ChunkCoord, questContext: QuestContextSnapshot) => generateFallbackChunk(target.info.worldId, target.info.seed, coord, questContext);

  function fromDraft(target: World, coord: ChunkCoord, questContext: QuestContextSnapshot, draft: ComposeDraft, _base: ChunkManifest): ChunkManifest | string[] {
    const plan = planChunk(target.info.seed, coord);
    // Quest givers keep their planned names (老王, 小李) whoever composes the chunk: on the anchor and on the figure standing there.
    const plannedName = new Map(draft.anchors.flatMap((anchor) => { const nameKey = plan.requiredAnchors.find((entry) => entry.anchorId === anchor.id)?.nameKey; return nameKey ? [[anchor.placementId, nameKey] as const] : []; }));
    const placements = draft.placements.map((placement) => {
      const nameKey = plannedName.get(placement.id) ?? (placement.attachTo ? plannedName.get(placement.attachTo.placementId) : undefined);
      return nameKey && placement.assetId.startsWith('an.npc.') ? { ...placement, params: { ...placement.params, nameKey } } : placement;
    });
    // Planner-owned fields (connectors, water, avenues, bridges) come from the plan.
    const candidate = ChunkManifestSchema.safeParse(sealManifest({
      worldId: target.info.worldId, coord, district: plan.district, catalogVersion: CATALOG_VERSION, generatorVersion: GENERATOR_VERSION, seed: target.info.seed,
      source: 'claude', questContext, connectors: plan.connectors, water: plan.water, bridges: plan.bridges,
      roads: [...plan.roads, ...draft.roads], placements, missingCapabilities: draft.missingCapabilities,
      // Model-chosen anchor ids are unique per chunk only; the coord prefix (as the fallback uses) keeps them unique across the world.
      anchors: draft.anchors.map((anchor) => { const required = plan.requiredAnchors.find((entry) => entry.anchorId === anchor.id); return required ? { ...anchor, ...(required.nameKey ? { nameKey: required.nameKey } : {}) } : { ...anchor, id: `c${coord.cx}.${coord.cz}:${anchor.id}` }; }),
    }));
    if (!candidate.success) return candidate.error.issues.slice(0, 5).map((issue) => `schema:${issue.path.join('.')}`);
    const result = validateManifest(candidate.data, plan);
    if (result.ok) return candidate.data;
    const repaired = repairManifest(candidate.data, plan);
    return repaired && validateManifest(repaired, plan).ok ? repaired : result.errors;
  }

  async function compose(sessionId: string, target: World, coord: ChunkCoord, questContext: QuestContextSnapshot, base: ChunkManifest, signal: AbortSignal, errors: string[]): Promise<ChunkManifest | undefined> {
    const key = chunkKey(coord);
    for (let attempt = 0; attempt <= rules.retries && !signal.aborted; attempt++) {
      await acquire();
      try {
        if (signal.aborted || target.manifests.has(key)) return undefined; // Superseded while queued.
        const spent = usage.get(sessionId) ?? { calls: 0, tokens: 0 };
        if (spent.calls >= rules.sessionCallCap || spent.tokens >= rules.sessionTokenCap) { errors.push('session-budget'); return undefined; }
        spent.calls++; usage.set(sessionId, spent);
        const input: ComposeInput = {
          seed: target.info.seed, plan: planChunk(target.info.seed, coord), questContext,
          neighbours: Object.fromEntries(NEIGHBOURS.flatMap(([edge, dx, dz]) => {
            const near = target.manifests.get(chunkKey({ cx: coord.cx + dx, cz: coord.cz + dz }));
            return near ? [[edge, { district: near.district, placements: near.placements.length, anchors: near.anchors.map((anchor) => anchor.capability) }]] : [];
          })),
          examples: [{ placements: base.placements.slice(0, 16), anchors: base.anchors.filter((anchor) => base.placements.slice(0, 16).some((entry) => entry.id === anchor.placementId)) }],
        };
        const result = await options.composer!(input, signal);
        spent.tokens += result.usage.inputTokens + result.usage.outputTokens;
        log({ key, usage: result.usage, attempt });
        if (!result.draft) { errors.push('refusal-or-empty'); continue; }
        const built = fromDraft(target, coord, questContext, result.draft, base);
        if (!Array.isArray(built)) return built;
        errors.push(...built);
      } catch (error) {
        errors.push(signal.aborted ? 'deadline' : error instanceof Error ? `error:${error.name}` : 'error');
      } finally { release(); }
    }
    return undefined;
  }

  function generate(sessionId: string, target: World, coord: ChunkCoord, questContext: QuestContextSnapshot): Job {
    const startedMs = Date.now();
    const controller = new AbortController();
    const promise = (async () => {
      const base = fallback(target, coord, questContext);
      const errors: string[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<undefined>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(undefined); }, rules.deadlineMs); });
      const aborted = new Promise<undefined>((resolve) => controller.signal.addEventListener('abort', () => resolve(undefined)));
      try {
        const composed = await Promise.race([compose(sessionId, target, coord, questContext, base, controller.signal, errors), deadline, aborted]);
        if (!composed && controller.signal.aborted) errors.push('deadline-or-superseded');
        return commit(target, composed ?? base, Date.now() - startedMs, errors);
      } finally { clearTimeout(timer); controller.abort(); jobs.delete(`${target.info.worldId}|${chunkKey(coord)}`); }
    })();
    return { promise };
  }

  return {
    provider: options.composer ? 'claude' : 'fallback',
    open(worldId = `w${randomUUID().replace(/-/g, '').slice(0, 16)}`) {
      let found = worlds.get(worldId);
      if (!found) {
        const seed = seedFromWorldId(worldId);
        const layout = worldLayout(seed);
        found = { info: { worldId, seed, generatorVersion: GENERATOR_VERSION, catalogVersion: CATALOG_VERSION, spawn: layout.spawn, hotelAnchorId: layout.hotel.anchorId }, manifests: new Map() };
        worlds.set(worldId, found);
        log({ city: 'world', event: 'created', worldId, seed });
      }
      return found.info;
    },
    view(worldId) {
      const target = world(worldId);
      return target.view ??= createWorldView(worldId, target.info.seed, target.manifests);
    },
    async request(sessionId, worldId, coords, urgent, questContext, allowClaude = true) {
      const target = world(worldId);
      // Jobs run to their deadline: the client never re-lists in-flight coords, so superseding by request would abort every batch.
      const chunks = await Promise.all(coords.map((coord) => {
        const key = chunkKey(coord);
        const committed = target.manifests.get(key);
        if (committed) return committed;
        if (urgent || !options.composer || !allowClaude) return commit(target, fallback(target, coord, questContext), 0);
        const jobKey = `${worldId}|${key}`;
        let job = jobs.get(jobKey);
        if (!job) { job = generate(sessionId, target, coord, questContext); jobs.set(jobKey, job); }
        return job.promise;
      }));
      return { chunks, pending: [] };
    },
    restore(worldId, manifests) {
      const target = world(worldId);
      const response: ChunkRestoreResponse = { accepted: [], rejected: [], chunks: [] };
      const anchorOwner = new Map([...target.manifests.values()].flatMap((entry) => entry.anchors.map((anchor) => [anchor.id, chunkKey(entry.coord)] as const)));
      for (const manifest of manifests) {
        const key = chunkKey(manifest.coord);
        const reject = (reason: string) => response.rejected.push({ key, reason });
        const existing = target.manifests.get(key);
        if (manifest.worldId !== worldId || manifest.seed !== target.info.seed) reject('Manifest belongs to a different world.');
        else if (manifest.generatorVersion !== GENERATOR_VERSION || manifest.catalogVersion !== CATALOG_VERSION) reject('Incompatible generator or catalog version; migrate or reset the world.');
        else if (!verifyManifestHash(manifest)) reject('Content hash mismatch.');
        else if (existing) { if (existing.contentHash === manifest.contentHash) response.accepted.push(key); else reject('A different layout is already committed for this chunk.'); }
        else if (manifest.anchors.some((anchor) => (anchorOwner.get(anchor.id) ?? key) !== key)) reject('An anchor id already exists in another chunk.');
        else {
          const result = validateManifest(manifest, planChunk(target.info.seed, manifest.coord), { requireHash: true });
          if (!result.ok) reject(`Invalid manifest: ${result.errors.slice(0, 3).join('; ')}`.slice(0, 240));
          else { commit(target, manifest, 0); response.accepted.push(key); for (const anchor of manifest.anchors) anchorOwner.set(anchor.id, key); }
        }
        const committed = target.manifests.get(key);
        if (committed && !response.chunks.includes(committed)) response.chunks.push(committed);
      }
      return response;
    },
  };
}
