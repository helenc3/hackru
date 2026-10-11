import { sceneManifest, type Position, type PublicState } from '@vibequest/shared';

export type Runtime = {
  position: Position; yaw: number; keys: Set<string>; active: boolean;
  busy: boolean; syncing: boolean; lastSync: number; lastSent: Position | null;
  pending: Position | null; generation: number;
  pitch?: number; path?: Position[]; groundPoint?: (x: number, y: number) => Position | null;
};

export function initialPosition(state: PublicState): Position {
  return { ...(state.zoneId === 'plaza' ? sceneManifest.spawn : sceneManifest.zones.find((zone) => zone.id === state.zoneId)?.center ?? sceneManifest.spawn) };
}
