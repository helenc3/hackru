import { ChunkManifestSchema, chunkKey, inSpawnBox, type ChunkManifest } from '@vibequest/shared';

// Browser persistence of original terrain manifests (CITY_GENERATION §9). Quest state never lives here.
const DB = 'vibequest-city';
const WORLD_KEY = 'vibequest.worldId';
/** Non-spawn chunks beyond this count are pruned oldest-first; spawn chunks are pinned. */
const MAX_UNPINNED = 300;

type Row = { id: string; worldId: string; pinned: boolean; savedAt: number; manifest: ChunkManifest };

let opening: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('worlds', { keyPath: 'worldId' });
      db.createObjectStore('chunks', { keyPath: 'id' }).createIndex('worldId', 'worldId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = undefined; reject(request.error); };
  });
  return opening;
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error); });
}
function all<T>(request: IDBRequest<T[]>): Promise<T[]> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
const rowId = (manifest: ChunkManifest) => `${manifest.worldId}|${chunkKey(manifest.coord)}`;

/** Committed manifests never change, so an existing row is kept rather than overwritten. */
export async function saveChunks(manifests: readonly ChunkManifest[]): Promise<void> {
  if (!manifests.length) return;
  const db = await open();
  const transaction = db.transaction(['worlds', 'chunks'], 'readwrite');
  const chunks = transaction.objectStore('chunks');
  for (const manifest of manifests) {
    transaction.objectStore('worlds').put({ worldId: manifest.worldId, generatorVersion: manifest.generatorVersion, catalogVersion: manifest.catalogVersion });
    const id = rowId(manifest);
    const existing = chunks.get(id);
    existing.onsuccess = () => { if (!existing.result) chunks.put({ id, worldId: manifest.worldId, pinned: inSpawnBox(manifest.coord), savedAt: Date.now(), manifest } satisfies Row); };
  }
  await done(transaction);
  await prune(manifests[0]!.worldId);
}

async function prune(worldId: string): Promise<void> {
  const db = await open();
  const rows = await all<Row>(db.transaction('chunks').objectStore('chunks').index('worldId').getAll(worldId));
  const unpinned = rows.filter((row) => !row.pinned).sort((a, b) => a.savedAt - b.savedAt);
  if (unpinned.length <= MAX_UNPINNED) return;
  const transaction = db.transaction('chunks', 'readwrite');
  for (const row of unpinned.slice(0, unpinned.length - MAX_UNPINNED)) transaction.objectStore('chunks').delete(row.id);
  await done(transaction);
}

/** Spawn-box manifests first; rows that no longer parse are skipped (the server would reject them anyway). */
export async function loadChunks(worldId: string): Promise<ChunkManifest[]> {
  const db = await open();
  const rows = await all<Row>(db.transaction('chunks').objectStore('chunks').index('worldId').getAll(worldId));
  return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned)).flatMap((row) => {
    const parsed = ChunkManifestSchema.safeParse(row.manifest);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The only path that evicts pinned spawn terrain: an explicit new-world/reset action. */
export async function resetWorld(worldId: string): Promise<void> {
  const db = await open();
  const rows = await all<Row>(db.transaction('chunks').objectStore('chunks').index('worldId').getAll(worldId));
  const transaction = db.transaction(['worlds', 'chunks'], 'readwrite');
  for (const row of rows) transaction.objectStore('chunks').delete(row.id);
  transaction.objectStore('worlds').delete(worldId);
  await done(transaction);
  if (rememberedWorldId() === worldId) localStorage.removeItem(WORLD_KEY);
}

export function rememberedWorldId(): string | undefined {
  try { return localStorage.getItem(WORLD_KEY) ?? undefined; } catch { return undefined; }
}
export function rememberWorld(worldId: string): void {
  try { localStorage.setItem(WORLD_KEY, worldId); } catch { /* Private mode: the world simply is not remembered. */ }
}
