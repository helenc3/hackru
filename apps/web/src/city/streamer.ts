import { CHUNK_SIZE, GENERATION_RULES, PREFETCH_RADIUS_CHUNKS, VISIBLE_RADIUS_CHUNKS, chunkKey, chunkOf, type ChunkCoord, type ChunkManifest, type Position } from '@vibequest/shared';

/** Player distance (m) to an uncommitted visible chunk that turns its request urgent (server commits a seeded fallback). */
export const URGENT_DISTANCE = 8;
const TICK_MS = 250;
const RETRY_MS = 1_000;

export type ChunkLoader = (coords: ChunkCoord[], urgent: boolean) => Promise<{ chunks: ChunkManifest[]; pending: ChunkCoord[] }>;

/** Distance from a point to the nearest point of a chunk's square (0 inside). */
export function distanceToChunk(position: Position, { cx, cz }: ChunkCoord): number {
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const dx = Math.max(x0 - position.x, 0, position.x - (x0 + CHUNK_SIZE));
  const dz = Math.max(z0 - position.z, 0, position.z - (z0 + CHUNK_SIZE));
  return Math.hypot(dx, dz);
}

/** Visible ring first, then prefetch ring; within a ring, chunks ahead of the travel direction first, then nearest. */
export function wantedChunks(position: Position, heading: { x: number; z: number }): ChunkCoord[] {
  const centre = chunkOf(position);
  const length = Math.hypot(heading.x, heading.z);
  const out: { coord: ChunkCoord; ring: number; ahead: number; near: number }[] = [];
  for (let dz = -PREFETCH_RADIUS_CHUNKS; dz <= PREFETCH_RADIUS_CHUNKS; dz++) for (let dx = -PREFETCH_RADIUS_CHUNKS; dx <= PREFETCH_RADIUS_CHUNKS; dx++) {
    const coord = { cx: centre.cx + dx, cz: centre.cz + dz };
    const ring = Math.max(Math.abs(dx), Math.abs(dz)) <= VISIBLE_RADIUS_CHUNKS ? 0 : 1;
    const toward = { x: (coord.cx + .5) * CHUNK_SIZE - position.x, z: (coord.cz + .5) * CHUNK_SIZE - position.z };
    const ahead = length > 1e-6 ? (toward.x * heading.x + toward.z * heading.z) / (length * (Math.hypot(toward.x, toward.z) || 1)) : 0;
    out.push({ coord, ring, ahead, near: distanceToChunk(position, coord) });
  }
  // Heading is bucketed so near-equal angles fall back to distance.
  return out.sort((a, b) => a.ring - b.ring || Math.round(b.ahead * 2) - Math.round(a.ahead * 2) || a.near - b.near).map((entry) => entry.coord);
}

/**
 * Requests committed chunks as the player walks: small batches on chunk-boundary changes (plus a slow
 * retry tick for pending work), never per frame. Deduplicates in-flight keys, bounds concurrency, and
 * drops queued keys that left the wanted area. Committed manifests are retained after meshes unload.
 */
export class ChunkStreamer {
  private readonly known = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly retryAt = new Map<string, number>();
  private batches = 0;
  private lastTick = -Infinity;
  private lastKey = '';
  private last: Position | null = null;
  private heading = { x: 0, z: 0 };
  private stopped = false;
  private clock = 0;

  constructor(private readonly load: ChunkLoader, private readonly commit: (manifests: ChunkManifest[]) => void, private readonly onError: (error: unknown) => void = () => undefined) {}

  /** Mark manifests already available (cache restore, earlier responses). */
  add(manifests: readonly ChunkManifest[]): void { for (const manifest of manifests) this.known.add(chunkKey(manifest.coord)); }
  has(coord: ChunkCoord): boolean { return this.known.has(chunkKey(coord)); }
  stop(): void { this.stopped = true; }

  update(position: Position, nowMs: number): void {
    if (this.stopped) return;
    const key = chunkKey(chunkOf(position));
    if (key === this.lastKey && nowMs - this.lastTick < TICK_MS) return;
    if (this.last) {
      const step = { x: position.x - this.last.x, z: position.z - this.last.z };
      if (Math.hypot(step.x, step.z) > .05) this.heading = { x: this.heading.x * .5 + step.x, z: this.heading.z * .5 + step.z };
    }
    this.last = { ...position };
    this.clock = nowMs;
    this.lastKey = key; this.lastTick = nowMs;
    const missing = wantedChunks(position, this.heading).filter((coord) => {
      const id = chunkKey(coord);
      return !this.known.has(id) && !this.inFlight.has(id) && (this.retryAt.get(id) ?? 0) <= nowMs;
    });
    // Urgent chunks travel alone so they don't force seeded fallbacks onto farther chunks Claude has time to compose.
    const near = (coord: ChunkCoord) => distanceToChunk(position, coord) <= URGENT_DISTANCE;
    const queue = [missing.filter(near), missing.filter((coord) => !near(coord))];
    for (const [index, group] of queue.entries()) {
      while (group.length && this.batches < GENERATION_RULES.concurrency) this.send(group.splice(0, GENERATION_RULES.batchSize), index === 0);
    }
  }

  private send(batch: ChunkCoord[], urgent: boolean): void {
    const keys = batch.map(chunkKey);
    for (const id of keys) this.inFlight.add(id);
    this.batches++;
    void this.load(batch, urgent).then(({ chunks, pending }) => {
      const fresh = chunks.filter((manifest) => !this.known.has(chunkKey(manifest.coord)));
      this.add(fresh);
      for (const coord of pending) this.retryAt.set(chunkKey(coord), this.clock + RETRY_MS);
      if (fresh.length && !this.stopped) this.commit(fresh);
    }, (error: unknown) => {
      for (const id of keys) this.retryAt.set(id, this.clock + RETRY_MS);
      this.onError(error);
    }).finally(() => {
      for (const id of keys) this.inFlight.delete(id);
      this.batches--;
      this.lastTick = -Infinity; // let the next update schedule follow-up work immediately
    });
  }
}
