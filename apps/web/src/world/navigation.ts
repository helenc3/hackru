import { ChoiceIdSchema, CueIdSchema, sceneManifest, type GameAction, type Position, type PublicState } from '@vibequest/shared';

export function zoneAt(position: Position) {
  // Specific zones precede the overlapping plaza; unzoned paths keep their
  // nearest authored zone, so crossing a corridor never teleports the player.
  const inside = sceneManifest.zones.filter(({ bounds: b }) => position.x >= b.minX && position.x <= b.maxX && position.z >= b.minZ && position.z <= b.maxZ);
  return (inside.find((zone) => zone.id !== 'plaza') ?? inside[0] ?? [...sceneManifest.zones].sort((a, b) => distance(position, a.center) - distance(position, b.center))[0]).id;
}

export function distance(a: Position, b: Position) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function collides(position: Position) {
  const r = sceneManifest.playerRadius;
  return sceneManifest.colliders.some(({ bounds: b }) => {
    const x = Math.max(b.minX, Math.min(position.x, b.maxX));
    const z = Math.max(b.minZ, Math.min(position.z, b.maxZ));
    return Math.hypot(position.x - x, position.z - z) < r - 1e-7;
  });
}

/** Small axis-separated steps avoid tunnelling and allow tangential sliding. */
export function movePlayer(position: Position, right: number, forward: number, yaw: number, seconds: number): Position {
  const length = Math.hypot(right, forward);
  if (!length) return position;
  const travel = sceneManifest.movementSpeed * Math.max(0, Math.min(seconds, 0.1));
  const dx = (right * Math.cos(yaw) - forward * Math.sin(yaw)) / length * travel;
  const dz = (-right * Math.sin(yaw) - forward * Math.cos(yaw)) / length * travel;
  const steps = Math.max(1, Math.ceil(travel / (sceneManifest.playerRadius / 2)));
  const r = sceneManifest.playerRadius;
  const b = sceneManifest.bounds;
  let next = { ...position };
  for (let i = 0; i < steps; i++) {
    const x = { ...next, x: Math.max(b.minX + r, Math.min(next.x + dx / steps, b.maxX - r)) };
    if (!collides(x)) next = x;
    const z = { ...next, z: Math.max(b.minZ + r, Math.min(next.z + dz / steps, b.maxZ - r)) };
    if (!collides(z)) next = z;
  }
  return next;
}

export function nearbyTargets(state: PublicState, position: Position) {
  const priority = { sign: 0, npc: 1, pa: 2, choice: 3 };
  return state.interactables.filter((target) => distance(target.position, position) <= sceneManifest.interactionRadius)
    .sort((a, b) => distance(a.position, position) - distance(b.position, position) || priority[a.kind] - priority[b.kind]);
}

export function targetAction(target: PublicState['interactables'][number]): GameAction | null {
  if (target.kind === 'sign') return { type: 'inspect', targetId: target.id };
  if (target.kind === 'pa') {
    const id = CueIdSchema.safeParse(target.id);
    return id.success ? { type: 'playCue', cueId: id.data, channel: 'audio' } : null;
  }
  if (target.kind === 'choice') {
    const id = ChoiceIdSchema.safeParse(target.id);
    return id.success ? { type: 'choose', choiceId: id.data } : null;
  }
  return null;
}

/** Route through a half-meter grid using collision-safe segments. */
export function walkingPath(start: Position, destination: Position): Position[] {
  const b = sceneManifest.bounds, radius = sceneManifest.playerRadius, step = .5;
  const valid = (p: Position) => p.x >= b.minX + radius && p.x <= b.maxX - radius && p.z >= b.minZ + radius && p.z <= b.maxZ - radius && !collides(p);
  const clear = (a: Position, end: Position) => {
    const count = Math.max(1, Math.ceil(distance(a, end) / (radius / 2)));
    for (let i = 1; i <= count; i++) if (!valid({ x: a.x + (end.x - a.x) * i / count, z: a.z + (end.z - a.z) * i / count })) return false;
    return true;
  };
  if (!valid(destination)) return [];
  if (clear(start, destination)) return [destination];
  const queue = [start], parents = [-1], seen = new Set(['0,0']);
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    if (distance(here, destination) <= step * 1.5 && clear(here, destination)) {
      const path = [destination];
      for (let j = i; j > 0; j = parents[j]) path.unshift(queue[j]);
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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
