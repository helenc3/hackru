import { WORLD_RULES, type Position } from '../contracts.js';
import { CHUNK_SIZE, chunkKey, chunkOf, chunkOrigin, type Anchor, type ChunkCollision, type ChunkManifest, type WorldView } from './contracts.js';
import { routeToHotel } from './directions.js';
import { planChunk } from './planner.js';
import { deriveCollision, walkableIn } from './validate.js';

const collisions = new WeakMap<ChunkManifest, ChunkCollision>();
export function collisionOf(manifest: ChunkManifest): ChunkCollision {
  let collision = collisions.get(manifest);
  if (!collision) { collision = deriveCollision(manifest); collisions.set(manifest, collision); }
  return collision;
}
type PlacedAnchor = Anchor & { position: Position; chunk: string };
const place = (manifest: ChunkManifest, anchor: Anchor): PlacedAnchor => {
  const o = chunkOrigin(manifest.coord);
  return { ...anchor, position: { x: o.x + anchor.x, z: o.z + anchor.z }, chunk: chunkKey(manifest.coord) };
};

/**
 * View over committed manifests, keyed by chunkKey. The map is read live on every call, so the
 * server may keep committing into it. Server movement and client prediction share this code.
 */
export function createWorldView(worldId: string, seed: string, manifests: ReadonlyMap<string, ChunkManifest>): WorldView {
  const anchor = (anchorId: string): PlacedAnchor | undefined => {
    for (const manifest of manifests.values()) {
      const found = manifest.anchors.find((a) => a.id === anchorId);
      if (found) return place(manifest, found);
    }
    return undefined;
  };
  return {
    worldId,
    committed: (coord) => manifests.has(chunkKey(coord)),
    walkable(position) {
      if (!manifests.has(chunkKey(chunkOf(position)))) return false;
      // The player's circle may reach into a neighbouring chunk near an edge; merge every touched committed chunk.
      const r = WORLD_RULES.playerRadius;
      const merged: ChunkCollision = { key: 'merged', solids: [], walkable: [], water: [] };
      const touched = new Set([[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]].map(([dx, dz]) => chunkKey(chunkOf({ x: position.x + dx!, z: position.z + dz! }))));
      for (const key of touched) {
        const manifest = manifests.get(key);
        if (!manifest) continue;
        const c = collisionOf(manifest);
        merged.solids.push(...c.solids); merged.walkable.push(...c.walkable); merged.water.push(...c.water);
      }
      return walkableIn(merged, position.x, position.z, r);
    },
    districtAt(position) {
      const coord = chunkOf(position);
      return manifests.get(chunkKey(coord))?.district ?? planChunk(seed, coord).district;
    },
    anchor,
    anchorsNear(position, radius) {
      const c = chunkOf(position), span = Math.ceil(radius / CHUNK_SIZE);
      const out: PlacedAnchor[] = [];
      for (let cx = c.cx - span; cx <= c.cx + span; cx++) for (let cz = c.cz - span; cz <= c.cz + span; cz++) {
        const manifest = manifests.get(chunkKey({ cx, cz }));
        if (manifest) for (const a of manifest.anchors) out.push(place(manifest, a));
      }
      const d = (a: PlacedAnchor) => Math.hypot(a.position.x - position.x, a.position.z - position.z);
      return out.filter((a) => d(a) <= radius).sort((a, b) => d(a) - d(b) || a.id.localeCompare(b.id));
    },
    directionsToHotel(fromAnchorId) {
      const from = anchor(fromAnchorId);
      return from ? routeToHotel(seed, manifests, { id: from.id, position: from.position }) : null;
    },
  };
}
