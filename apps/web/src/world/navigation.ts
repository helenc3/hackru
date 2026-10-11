import { CHUNK_SIZE, ChoiceIdSchema, WORLD_RULES, streetPath, type ChunkManifest, type GameAction, type Position, type PublicState, type WorldView, type ZoneId } from '@vibequest/shared';

/** The movement subset of WorldView. Client prediction uses the same committed manifests as server validation. */
export type Walkable = Pick<WorldView, 'walkable'>;

export function distance(a: Position, b: Position) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function zoneAt(view: Pick<WorldView, 'districtAt'>, position: Position): ZoneId {
  return view.districtAt(position);
}

/** WorldView.walkable already tests the player's circle (WORLD_RULES.playerRadius) — the server's exact rule. */
export function collides(view: Walkable, position: Position) {
  return !view.walkable(position);
}

/** Small axis-separated steps avoid tunnelling and allow tangential sliding. */
export function movePlayer(view: Walkable, position: Position, right: number, forward: number, yaw: number, seconds: number): Position {
  const length = Math.hypot(right, forward);
  if (!length) return position;
  const travel = WORLD_RULES.movementSpeed * Math.max(0, Math.min(seconds, 0.1));
  const dx = (right * Math.cos(yaw) - forward * Math.sin(yaw)) / length * travel;
  const dz = (-right * Math.sin(yaw) - forward * Math.cos(yaw)) / length * travel;
  const steps = Math.max(1, Math.ceil(travel / (WORLD_RULES.playerRadius / 2)));
  let next = { ...position };
  for (let i = 0; i < steps; i++) {
    const x = { ...next, x: next.x + dx / steps };
    if (!collides(view, x)) next = x;
    const z = { ...next, z: next.z + dz / steps };
    if (!collides(view, z)) next = z;
  }
  return next;
}

export function nearbyTargets(state: Pick<PublicState, 'interactables'>, position: Position) {
  const priority = { sign: 0, npc: 1, 'photo-spot': 2, choice: 3, landmark: 4 };
  return state.interactables.filter((target) => target.kind !== 'landmark' && distance(target.position, position) <= WORLD_RULES.interactionRadius)
    .sort((a, b) => distance(a.position, position) - distance(b.position, position) || priority[a.kind] - priority[b.kind]);
}

/** NPCs open a conversation (onTalk) and landmarks are labels only; both return null. */
export function targetAction(target: PublicState['interactables'][number], photo?: PublicState['photo']): GameAction | null {
  if (target.kind === 'sign') return { type: 'inspect', targetId: target.id };
  if (target.kind === 'photo-spot') return { type: 'choose', choiceId: 'q3.start-photo', anchorId: photo?.viewpointAnchorId ?? target.id };
  if (target.kind === 'choice') {
    const id = ChoiceIdSchema.safeParse(target.choiceId);
    return id.success ? { type: 'choose', choiceId: id.data, anchorId: target.id } : null;
  }
  return null;
}

/** Route through a half-metre grid using collision-safe segments; bounded to the loaded neighbourhood. */
export function walkingPath(view: Walkable, start: Position, destination: Position, maxNodes = 6_000): Position[] {
  const step = .5;
  const clear = (a: Position, end: Position) => {
    const count = Math.max(1, Math.ceil(distance(a, end) / (WORLD_RULES.playerRadius / 2)));
    for (let i = 1; i <= count; i++) if (collides(view, { x: a.x + (end.x - a.x) * i / count, z: a.z + (end.z - a.z) * i / count })) return false;
    return true;
  };
  if (collides(view, destination) || distance(start, destination) > CHUNK_SIZE * 1.5) return [];
  if (clear(start, destination)) return [destination];
  const queue = [start], parents = [-1], seen = new Set(['0,0']);
  for (let i = 0; i < queue.length && queue.length < maxNodes; i++) {
    const here = queue[i]!;
    if (distance(here, destination) <= step * 1.5 && clear(here, destination)) {
      const path = [destination];
      for (let j = i; j > 0; j = parents[j]!) path.unshift(queue[j]!);
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { x: here.x + dx * step, z: here.z + dz * step };
      const key = `${Math.round((next.x - start.x) / step)},${Math.round((next.z - start.z) / step)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!clear(here, next)) continue;
      queue.push(next); parents.push(i);
    }
  }
  return [];
}

/** How far one walking leg reaches along a long route; short enough for walkingPath's grid search. */
export const LEG_METRES = 18;

/**
 * The next obstacle-aware leg toward a far goal: follow the street network (committed roads, planner
 * roads where chunks have not streamed yet) and path-find only the next ≤ LEG_METRES. Callers re-plan
 * when a leg ends, so legs into newly committed chunks succeed once streaming catches up.
 */
export function nextLeg(view: Walkable, seed: string, manifests: ReadonlyMap<string, ChunkManifest>, start: Position, goal: Position): Position[] {
  if (distance(start, goal) <= LEG_METRES) return walkingPath(view, start, goal);
  const route = [start, ...(streetPath(seed, manifests, start, goal) ?? []), goal];
  // Walk the polyline from the start; try the farthest walkable point within one leg, then nearer ones.
  const samples: Position[] = [];
  let travelled = 0;
  for (let i = 1; i < route.length && travelled < LEG_METRES; i++) {
    const a = route[i - 1]!, b = route[i]!, length = distance(a, b);
    for (let d = 1; d <= length && travelled + d <= LEG_METRES; d += 1) samples.push({ x: a.x + (b.x - a.x) * d / length, z: a.z + (b.z - a.z) * d / length });
    travelled += length;
  }
  for (const sample of samples.reverse()) {
    if (distance(sample, start) < 1) break;
    if (collides(view, sample)) continue;
    const path = walkingPath(view, start, sample);
    if (path.length) return path;
  }
  return [];
}
