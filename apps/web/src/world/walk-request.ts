import type { Position } from '@vibequest/shared';

type WalkHandler = (target: Position) => void;
let handler: WalkHandler | null = null;

/** The live world registers how it walks the player; returns an unregister function. */
export function registerWalkHandler(fn: WalkHandler): () => void {
  handler = fn;
  return () => { if (handler === fn) handler = null; };
}

/** Walk the player to a point along the click-to-move path (with its destination marker). False when no world is live. */
export function requestWalk(target: Position): boolean {
  if (!handler) return false;
  handler(target);
  return true;
}
