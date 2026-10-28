import type { Position, PublicState } from '@vibequest/shared';
import type { Walkable } from './navigation';

export type Runtime = {
  position: Position; yaw: number; keys: Set<string>; active: boolean;
  busy: boolean; syncing: boolean; lastSync: number; lastSent: Position | null;
  pending: Position | null; generation: number;
  lastAckAt?: number;
  pitch?: number; path?: Position[];
  /** Collision over committed manifests; movement waits until the player's chunk is committed. */
  view?: Walkable; ready?: (position: Position) => boolean;
  /** A far walk target (Walk there / Go to photo spot), followed one re-planned leg at a time. */
  goal?: Position; replanAt?: number; leg?: (from: Position, goal: Position) => Position[];
};

export function initialPosition(state: Pick<PublicState, 'position'>): Position {
  return { ...state.position };
}
