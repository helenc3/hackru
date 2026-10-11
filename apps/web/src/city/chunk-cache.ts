// Only the world identifier is remembered in the browser. Terrain lives on the server.
const WORLD_KEY = 'vibequest.worldId';

export function rememberWorld(worldId: string): void {
  try { localStorage.setItem(WORLD_KEY, worldId); } catch { /* Browser storage is optional. */ }
}
