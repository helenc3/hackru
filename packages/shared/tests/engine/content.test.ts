import { describe, expect, it } from 'vitest';
import { authoredFacts, cues, groundedReplies, npcs, sceneManifest } from '../../src/content/index.js';
import { CueDefinitionSchema, NpcDefinitionSchema } from '../../src/contracts.js';

describe('authored Mandarin content', () => {
  it('uses canonical scene IDs and coordinates for every cue and NPC', () => {
    expect(cues).toHaveLength(6);
    expect(npcs).toHaveLength(3);
    for (const cue of cues) {
      expect(CueDefinitionSchema.safeParse(cue).success).toBe(true);
      expect(cue.position).toEqual(sceneManifest.interactables.find((entry) => entry.id === cue.id)?.position);
      expect(cue.factSnapshotId in authoredFacts).toBe(true);
      expect(cue.review).toBe('pending');
    }
    for (const npc of npcs) {
      expect(NpcDefinitionSchema.safeParse(npc).success).toBe(true);
      expect(npc.position).toEqual(sceneManifest.interactables.find((entry) => entry.id === npc.id)?.position);
    }
  });
  it('keeps prices and platform-change lines grounded in fixed snapshots', () => {
    expect(authoredFacts['p1.cafe'].teaPriceCny).toBe('10');
    expect(authoredFacts['p1.cafe'].waterPriceCny).toBe('5');
    expect(authoredFacts['p2.original'].jiangbinPlatform).toBe('2');
    expect(authoredFacts['p2.updated'].jiangbinPlatform).toBe('3');
    expect(authoredFacts['b1.updated'].haigangPlatform).toBe('2');
    expect(cues.find((cue) => cue.id === 'p2.platform-change')?.textZh).toContain('三号站台，不是二号站台');
    expect(cues.find((cue) => cue.id === 'b1.harbor-change')?.textZh).toContain('二号站台');
    for (const reply of Object.values(groundedReplies)) expect(reply.length).toBeLessThanOrEqual(80);
  });
});
