// Only the world identifier is remembered in the browser. Terrain lives on the server.
const WORLD_KEY = 'vibequest.worldId';

/** Forget the selected world; a new session then opens a new server-owned city. */
export async function resetWorld(worldId: string): Promise<void> {
  if (rememberedWorldId() === worldId) {
    try { localStorage.removeItem(WORLD_KEY); } catch { /* Browser storage is optional. */ }
  }
}

export function rememberedWorldId(): string | undefined {
  try { return localStorage.getItem(WORLD_KEY) ?? undefined; } catch { return undefined; }
}
export function rememberWorld(worldId: string): void {
  try { localStorage.setItem(WORLD_KEY, worldId); } catch { /* Browser storage is optional. */ }
}
