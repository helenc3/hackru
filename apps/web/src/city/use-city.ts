import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  QuestCategorySchema, SPAWN_RADIUS_CHUNKS, chunkKey, chunkOf, createWorldView, generateFallbackChunk, seedFromWorldId,
  type ChunkManifest, type Position, type QuestCategory, type PublicState, type WorldView,
} from '@vibequest/shared';
import { createCityClient, type CityClient } from './city-client';
import { loadChunks, rememberWorld, saveChunks } from './chunk-cache';
import { ChunkStreamer } from './streamer';

export type CityStatus = 'restoring' | 'streaming' | 'error';
/** What WorldRenderer needs from the city. `focus` is called by the render loop with the predicted player position. */
export type CityHandle = {
  worldId: string;
  manifests: ReadonlyMap<string, ChunkManifest>;
  view: WorldView;
  /** Bumps whenever manifests change. */
  revision: number;
  status: CityStatus;
  error?: string;
  /** True once the chunk under `position` is committed; movement waits for it. */
  ready(position: Position): boolean;
  focus(position: Position): void;
};

const PREVIEW_WORLD = 'preview';
function spawnBox(): { cx: number; cz: number }[] {
  const out = [];
  for (let cz = -SPAWN_RADIUS_CHUNKS; cz <= SPAWN_RADIUS_CHUNKS; cz++) for (let cx = -SPAWN_RADIUS_CHUNKS; cx <= SPAWN_RADIUS_CHUNKS; cx++) out.push({ cx, cz });
  return out;
}
/** Inert welcome-screen city: seeded fallback chunks generated locally; never sent to the server. */
function previewChunks(): ChunkManifest[] {
  const seed = seedFromWorldId(PREVIEW_WORLD);
  try { return spawnBox().map((coord) => generateFallbackChunk(PREVIEW_WORLD, seed, coord, { missionId: 'Q1', weights: Object.fromEntries(QuestCategorySchema.options.map((category) => [category, 1])) as Record<QuestCategory, number> })); } catch { return []; }
}

/**
 * Streams the session's world. With a live state: restore IndexedDB manifests to the server first
 * (server-validated; existing commits win), then request the rest around the player. With `state`
 * null: a local preview city. With `options.manifests`: a static city (tests/fixtures), no network.
 */
export function useCity(state: Pick<PublicState, 'sessionId' | 'worldId' | 'validationMode'> | null, options: { client?: CityClient; manifests?: readonly ChunkManifest[] } = {}): CityHandle {
  const sessionId = state?.sessionId ?? null;
  const validation = state?.validationMode ?? false;
  const worldId = options.manifests?.[0]?.worldId ?? state?.worldId ?? PREVIEW_WORLD;
  const store = useRef(new Map<string, ChunkManifest>());
  const streamer = useRef<ChunkStreamer | null>(null);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<CityStatus>('restoring');
  const [error, setError] = useState<string>();
  const client = useMemo(() => options.client ?? createCityClient(), [options.client]);
  const staticManifests = options.manifests;

  useEffect(() => {
    let live = true;
    const map = new Map<string, ChunkManifest>();
    store.current = map;
    setRevision((value) => value + 1); setError(undefined);
    const commit = (manifests: readonly ChunkManifest[], persist: boolean) => {
      if (!live) return;
      // Once revealed, a chunk's layout is stable: never replace a committed key.
      const fresh = manifests.filter((manifest) => manifest.worldId === worldId && !map.has(chunkKey(manifest.coord)));
      if (!fresh.length) return;
      for (const manifest of fresh) map.set(chunkKey(manifest.coord), manifest);
      setRevision((value) => value + 1);
      if (persist) void saveChunks(fresh).catch(() => undefined);
    };
    if (staticManifests || !sessionId) {
      commit(staticManifests ?? previewChunks(), false);
      setStatus('streaming');
      return () => { live = false; };
    }
    if (!validation) rememberWorld(worldId); // validation sessions never claim the player's city
    setStatus('restoring');
    const stream = new ChunkStreamer((coords, urgent) => client.chunks(sessionId, coords, urgent), (manifests) => commit(manifests, true), (reason) => { if (live) setError(reason instanceof Error ? reason.message : 'City streaming failed.'); });
    streamer.current = stream;
    void (async () => {
      try {
        const cached = await loadChunks(worldId).catch(() => [] as ChunkManifest[]);
        // Restore in contract-sized batches (spawn box first); the server returns its committed versions.
        for (let i = 0; i < cached.length && live; i += 25) {
          const result = await client.restore(sessionId, cached.slice(i, i + 25));
          stream.add(result.chunks);
          commit(result.chunks, false);
        }
      } catch (reason) {
        if (live) setError(reason instanceof Error ? reason.message : 'Saved city could not be restored.');
      }
      if (live) setStatus('streaming');
    })();
    return () => { live = false; stream.stop(); if (streamer.current === stream) streamer.current = null; };
  }, [client, sessionId, worldId, staticManifests, validation]);

  // ponytail: the view is rebuilt per commit (≤ a few per second); make it incremental if profiling says so.
  const view = useMemo(() => createWorldView(worldId, seedFromWorldId(worldId), store.current), [worldId, revision]);
  const focus = useCallback((position: Position) => { if (status === 'streaming') streamer.current?.update(position, performance.now()); }, [status]);
  const ready = useCallback((position: Position) => store.current.has(chunkKey(chunkOf(position))), []);
  return { worldId, manifests: store.current, view, revision, status, error, ready, focus };
}
