import { WORLD_RULES, type Position, type PublicState } from '@vibequest/shared';
import { distance, nearbyTargets } from './navigation';

/** Entry latch with a wider exit radius: closing never traps a player in a reopen loop. */
export class AutoEngage {
  private entered = new Map<string, Position>();
  reset() { this.entered.clear(); }
  candidate(state: Pick<PublicState, 'interactables'>, position: Position, blocked: boolean): string | undefined {
    for (const [id, lastPosition] of this.entered) {
      const target = state.interactables.find((item) => item.id === id);
      if (distance(target?.position ?? lastPosition, position) > WORLD_RULES.interactionRadius + .75) this.entered.delete(id);
    }
    if (blocked) return;
    return nearbyTargets(state, position).find((item) => item.kind === 'npc' && !this.entered.has(item.id))?.id;
  }
  engaged(state: Pick<PublicState, 'interactables'>, position: Position) {
    // Latch overlapping NPCs too; closing one cannot immediately switch to its neighbour.
    for (const target of nearbyTargets(state, position)) if (target.kind === 'npc') this.entered.set(target.id, target.position);
  }
}
