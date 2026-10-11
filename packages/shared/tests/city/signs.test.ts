import { describe, expect, it } from 'vitest';
import { generateFallbackChunk, planChunk, seedFromWorldId } from '../../src/city/index.js';

const weights = { 'drink-vendor': 1, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 };

describe('shop signs match the shop', () => {
  it('drink vendors advertise drinks and restaurant signs name their food', () => {
    for (const worldId of ['w-signs-1', 'w-signs-2', 'w-signs-3']) {
      const seed = seedFromWorldId(worldId);
      for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
        const chunk = generateFallbackChunk(worldId, seed, { cx, cz }, { missionId: 'Q1', weights }, planChunk(seed, { cx, cz }));
        const byId = new Map(chunk.placements.map((p) => [p.id, p]));
        for (const p of chunk.placements) {
          if (p.assetId.startsWith('an.vendor.')) expect(['drink-shop', 'drinks', 'convenience']).toContain(p.params.nameKey);
          const parent = p.attachTo && byId.get(p.attachTo.placementId);
          if (!parent || typeof p.params.label !== 'string') continue;
          if (p.assetId === 'sf.sign.neon') expect(['open', 'welcome']).toContain(p.params.label);
          else if (p.assetId.startsWith('sf.sign.')) {
            if (parent.assetId === 'bld.restaurant.noodle') expect(p.params.label).toBe('noodles');
            expect(p.params.label).not.toBe('cafe'); // coffee is sold out everywhere
          }
        }
      }
    }
  });
});
