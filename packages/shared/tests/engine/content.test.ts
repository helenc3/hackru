import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { authoredFacts, characterDescriptions, clarifyReplies, COACHING_PHRASES, cues, DRINK_PRICES, groundedReplies, missions, npcOpeners, speakMandarinReplies, STARTING_CNY } from '../../src/content/index.js';

describe('authored quest content', () => {
  it('assigns only human-approved Mandarin voices', () => {
    const approved = readFileSync(new URL('../../../../docs/MANDARIN_VOICES.md', import.meta.url), 'utf8');
    for (const npc of characterDescriptions) expect(approved).toContain(`\`${npc.voice.id}\``);
    expect(characterDescriptions.map((npc) => npc.voice.id)).not.toContain('9lHjugDhwqoxA5MhX0az');
  });
  it('keeps prices, the sold-out line, and starting money grounded', () => {
    expect(authoredFacts['q1.drinks']).toMatchObject({ opener: '你想喝什么？', teaPriceCny: String(DRINK_PRICES.tea), waterPriceCny: String(DRINK_PRICES.water) });
    expect(groundedReplies.coffeeUnavailable).toBe('咖啡卖完了。我们有茶和水。');
    expect(STARTING_CNY).toBeGreaterThanOrEqual(Math.min(...Object.values(DRINK_PRICES)));
  });
  it('keeps every authored NPC line in character: no coaching scripts', () => {
    const lines = [...Object.values(groundedReplies), ...Object.values(npcOpeners), ...Object.values(speakMandarinReplies), ...Object.values(clarifyReplies), ...characterDescriptions.map((npc) => npc.persona)];
    for (const line of lines) for (const phrase of COACHING_PHRASES) expect(line.toLowerCase(), line).not.toContain(phrase);
  });
  it('offers three quests in order with a sign per quest', () => {
    expect(missions.map((mission) => [mission.id, mission.prerequisiteMissionIds])).toEqual([['Q1', []], ['Q2', ['Q1']], ['Q3', ['Q2']]]);
    expect(cues.map((cue) => cue.missionId)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(cues.find((cue) => cue.id === 'q2.hotel-sign')!.textZh).toBe('上海大酒店');
  });
});
