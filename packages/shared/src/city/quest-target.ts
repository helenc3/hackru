import type { Capability, WorldView } from './contracts.js';
import { CHUNK_SIZE, chunkOf, chunkOrigin } from './contracts.js';
import type { InternalState, Position, QuestTarget } from '../contracts.js';
import { planChunk, worldLayout } from './planner.js';
import { seedFromWorldId } from './rng.js';
import { text } from './text-catalog.js';

type Guidance = Pick<InternalState, 'missionId' | 'status' | 'worldId' | 'position' | 'photo'>;

/** A planner-guaranteed anchor: the committed position when its chunk is streamed, else the planned stand point. */
function planned(seed: string, cx: number, cz: number, capability: Capability, world: Pick<WorldView, 'anchor'>) {
  const required = planChunk(seed, { cx, cz }).requiredAnchors.find((entry) => entry.capability === capability);
  if (!required) return undefined;
  const origin = chunkOrigin({ cx, cz });
  const position = world.anchor(required.anchorId)?.position ?? { x: origin.x + (required.near?.x ?? CHUNK_SIZE / 2), z: origin.z + (required.near?.z ?? CHUNK_SIZE / 2) };
  return { anchorId: required.anchorId, position, nameKey: required.nameKey };
}

/**
 * Where the active quest's next step is. Derived from the deterministic planner, so it exists
 * before the target chunk streams in. Guidance only; it never grants progress.
 */
export function questTarget(state: Guidance, world: Pick<WorldView, 'anchor'>): QuestTarget | null {
  if (state.status !== 'active') return null;
  const seed = seedFromWorldId(state.worldId);
  const npc = (cx: number, cz: number, capability: Capability, fallbackZh: string, fallbackEnglish: string): QuestTarget | null => {
    const found = planned(seed, cx, cz, capability, world);
    if (!found) return null;
    const name = found.nameKey ? text('npc-name', found.nameKey) : undefined;
    return { label: name?.zh ?? fallbackZh, english: name?.english ?? fallbackEnglish, position: found.position, anchorId: found.anchorId };
  };
  switch (state.missionId) {
    case 'Q1': return npc(0, 0, 'drink-vendor', '老王', 'Lao Wang');
    case 'Q2': return npc(1, 0, 'direction-helper', '小李', 'Xiao Li');
    case 'Q3': {
      if (state.photo) return { label: '拍照点', english: 'Photo spot', position: state.photo.spot, anchorId: state.photo.viewpointAnchorId };
      // Guaranteed viewpoint + passer-by pairs sit on the west bank every third row; pick the nearest.
      const river = worldLayout(seed).river;
      const cx = Math.floor((river.center - river.width / 2) / CHUNK_SIZE);
      const base = Math.round(chunkOf(state.position).cz / 3) * 3;
      const candidates = [base - 3, base, base + 3].flatMap((cz) => {
        const found = planned(seed, cx, cz, 'photo-passerby', world);
        return found ? [found] : [];
      });
      const distance = (p: Position) => Math.hypot(p.x - state.position.x, p.z - state.position.z);
      const best = candidates.sort((a, b) => distance(a.position) - distance(b.position))[0];
      return best ? { label: '黄浦江 · 路人', english: 'Huangpu River passer-by', position: best.position, anchorId: best.anchorId } : null;
    }
  }
}
