import { describe, expect, it } from 'vitest';
import { generateFallbackChunk, planChunk, seedFromWorldId, validateManifest, type ChunkManifest } from '../../src/city/index.js';

const weights = { 'drink-vendor': 1, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 } as const;
/** The person standing at an NPC anchor: the bound figure, or the figure in its counter's socket. */
const figureFor = (m: ChunkManifest, anchorId: string) => {
  const anchor = m.anchors.find((a) => a.id === anchorId)!;
  return m.placements.find((p) => p.assetId.startsWith('an.npc.') && (p.id === anchor.placementId || p.attachTo?.placementId === anchor.placementId));
};

describe('quest NPCs are always there', () => {
  it('老王, 小李 and a river passer-by stand at their planned spots in every seeded world', () => {
    for (let i = 0; i < 60; i++) {
      const worldId = `wquest${i.toString(16).padStart(10, '0')}`, seed = seedFromWorldId(worldId);
      for (const [coord, capability, name] of [[{ cx: 0, cz: 0 }, 'drink-vendor', 'laowang'], [{ cx: 1, cz: 0 }, 'direction-helper', 'xiaoli'], [{ cx: 3, cz: 0 }, 'photo-passerby', undefined]] as const) {
        const plan = planChunk(seed, coord);
        const manifest = generateFallbackChunk(worldId, seed, coord, { missionId: 'Q1', weights });
        expect(validateManifest(manifest, plan), `${worldId} ${coord.cx},${coord.cz}`).toEqual({ ok: true }); // includes stand-point reachability
        const required = plan.requiredAnchors.find((a) => a.capability === capability)!;
        const anchor = manifest.anchors.find((a) => a.id === required.anchorId)!;
        expect(anchor.kind).toBe('npc');
        const figure = figureFor(manifest, anchor.id);
        expect(figure, `${capability} in ${worldId} has someone standing there`).toBeDefined();
        if (name) { expect(anchor.nameKey).toBe(name); expect(figure!.params.nameKey).toBe(name); }
      }
    }
  });
});
