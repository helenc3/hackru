import { describe, expect, it } from 'vitest';
import { generateFallbackChunk, planChunk, seedFromWorldId, validateManifest, type ChunkManifest } from '@vibequest/shared';
import { createWorldService } from '../../src/city/world-service.js';
import type { ComposeDraft } from '../../src/city/claude-city.js';

// Real planner, catalog and validator; only Claude is faked. Whatever Claude returns, 小李 must stand at his planned spot.
const weights = { 'drink-vendor': 1, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 } as const;
const quest = { missionId: 'Q2' as const, weights };
const guideIn = (m: ChunkManifest) => {
  const anchor = m.anchors.find((a) => a.capability === 'direction-helper' && a.id.endsWith(':guide-1'))!;
  return { anchor, figure: m.placements.find((p) => p.id === anchor.placementId && p.assetId.startsWith('an.npc.')) };
};

async function composeWith(edit: (draft: ComposeDraft, base: ChunkManifest) => ComposeDraft, worldNumber: number) {
  const worldId = `wnpcdraft${worldNumber.toString(16).padStart(9, '0')}`, seed = seedFromWorldId(worldId), coord = { cx: 1, cz: 0 };
  const base = generateFallbackChunk(worldId, seed, coord, quest);
  const draft = edit({ placements: structuredClone(base.placements), roads: base.roads.filter((r) => !planChunk(seed, coord).roads.some((p) => p.id === r.id)), anchors: structuredClone(base.anchors), missingCapabilities: [] }, base);
  const logs: { source?: string }[] = [];
  const worlds = createWorldService({ composer: async () => ({ draft, usage: { inputTokens: 1, outputTokens: 1 } }), log: (entry) => logs.push(entry as { source?: string }) });
  worlds.open(worldId);
  const [chunk] = (await worlds.request('s', worldId, [coord], false, quest)).chunks;
  expect(validateManifest(chunk!, planChunk(seed, coord))).toEqual({ ok: true });
  return { chunk: chunk!, source: logs.find((entry) => entry.source)?.source };
}

describe('Claude-composed chunks keep the quest NPCs', () => {
  it('renames a draft guide to 小李 on both the anchor and the figure', async () => {
    for (let i = 0; i < 5; i++) {
      const { chunk, source } = await composeWith((draft) => {
        const anchor = draft.anchors.find((a) => a.id.endsWith(':guide-1'))!;
        anchor.nameKey = 'achen';
        draft.placements.find((p) => p.id === anchor.placementId)!.params.nameKey = 'achen';
        return draft;
      }, i);
      expect(source).toBe('claude');
      const { anchor, figure } = guideIn(chunk);
      expect(anchor.nameKey).toBe('xiaoli');
      expect(figure?.params.nameKey).toBe('xiaoli');
    }
  });
  it('falls back when a draft binds 小李 to a sign instead of a person', async () => {
    const { chunk, source } = await composeWith((draft) => {
      const anchor = draft.anchors.find((a) => a.id.endsWith(':guide-1'))!;
      const board = draft.placements.find((p) => p.assetId === 'an.helper.info-board')!;
      draft.placements = draft.placements.filter((p) => p.id !== anchor.placementId);
      anchor.placementId = board.id;
      return draft;
    }, 7);
    expect(source).toBe('fallback');
    expect(guideIn(chunk).figure?.params.nameKey).toBe('xiaoli');
  });
});
