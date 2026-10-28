import { WORLD_RULES, type Position } from '@vibequest/shared';
import { distance } from './navigation';

/** Use receipt of the previous acknowledgement as a conservative server-clock
 * boundary. Rendering/request queues can bunch samples that were simulated farther
 * apart. Keep half of the server's one-metre jitter allowance in reserve. */
export function movementWaitMs(previous: Position | null, next: Position, acknowledgedAt: number | undefined, now: number, multiplier = 1): number {
  if (!previous || acknowledgedAt === undefined) return 0;
  const needed = Math.max(0, distance(previous, next) - .5) / (WORLD_RULES.movementSpeed * multiplier) * 1_000;
  return Math.max(0, needed - Math.max(0, now - acknowledgedAt));
}
