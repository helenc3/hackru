import { describe, expect, it } from 'vitest';
import { ANCHORS, advance, campaign, q1, q2, q3 } from './helpers.js';

describe('Shanghai exploration campaign through the fixture API', () => {
  it('clears Q1 → Q2 → Q3 in order with typed input', async () => {
    const game = await campaign();
    expect(game.state).toMatchObject({ missionId: 'Q1', unlockedMissionIds: ['Q1'], timer: null, inventory: { cny: 20, drinks: [] } });
    await game.act({ type: 'startMission', missionId: 'Q2' }, 422); // locked until Q1 clears
    await q1(game); await q2(game); await q3(game);
    expect(game.state.completedMissionIds).toEqual(['Q1', 'Q2', 'Q3']);
    const raw = JSON.stringify(game.state);
    for (const hidden of ['secretFacts', 'evidence', 'replyZh', 'exploration', 'cooldownRemainingMs']) expect(raw).not.toContain(`"${hidden}":`);
  });

  it('Q1: unavailable coffee, ambiguous requests and repeat purchases never re-grant the reward', async () => {
    const game = await campaign(); await game.warm();
    const vague = await game.talk('我想去月球。');
    expect(vague.body.state.status).toBe('active');
    await game.pay(ANCHORS.vendor.id, 422); // nothing confirmed yet
    await game.talk('我要咖啡。'); await game.pay(ANCHORS.vendor.id, 422);
    await game.talk('我要水。');
    expect((await game.talk('水五元。', 'vendor', undefined, 422)).body.error.code).toBe('GOAL_ACTION_PENDING'); // Pay is up: only the button now
    await game.pay(ANCHORS.farVendor.id, 422); // payment happens at the vendor you are standing at
    await game.pay();
    const xp = game.state.xp;
    expect(game.state).toMatchObject({ status: 'cleared', inventory: { cny: 15, drinks: ['water'] } });
    await game.pay(ANCHORS.vendor.id, 422);
    await game.act({ type: 'startMission', missionId: 'Q1' }, 422);
    expect(game.state.inventory).toMatchObject({ cny: 15, drinks: ['water'] });
    expect(game.state.purchases).toHaveLength(1);
    expect(game.state.xp).toBe(xp);
  });

  it('Q1: insufficient funds rejects payment without changing money or inventory', async () => {
    const game = await campaign();
    await game.services.sessionStore.withSession(game.state.sessionId, async (session) => { session.state.inventory.cny = 0; });
    await game.warm(); await game.talk('我要水。'); await game.talk('水五元。');
    const rejected = await game.pay(ANCHORS.vendor.id, 422);
    expect(rejected.body.error.code).toBe('ACTION_FORBIDDEN');
    expect(game.state.inventory).toMatchObject({ cny: 0, drinks: [] });
  });

  it('Q2: only a guide in reach gives a route, and other destinations are not invented', async () => {
    const game = await campaign(); await q1(game);
    await game.act({ type: 'startMission', missionId: 'Q2' }); await game.warm();
    await game.talk('请问，去上海大酒店怎么走？', 'guide', ANCHORS.guide.id, 422); // too far away
    await game.walkTo(ANCHORS.guide.position);
    await game.talk('请问，去上海大酒店怎么走？', 'vendor', ANCHORS.guide.id, 422); // role must match the anchor
    const other = await game.talk('去火车站怎么走？', 'guide');
    expect(other.body.state).toMatchObject({ status: 'active', directions: null });
    expect(other.body.npcReply).not.toContain('南京路');
    const repeat = await game.talk('请再说一遍。', 'guide');
    expect(repeat.body.state.status).toBe('active');
    const asked = await game.talk('请问，去上海大酒店怎么走？', 'guide');
    expect(asked.body.npcReply).toBe(asked.body.state.directions.textZh);
    expect(asked.body.events.some((event: { kind: string }) => event.kind === 'directions')).toBe(true);
    expect(game.state.status).toBe('cleared');
  });

  it('Q3: missing viewpoint, wrong spot, early or failed capture never complete; completed quests cannot restart', async () => {
    const game = await campaign(); await q1(game); await q2(game);
    await game.act({ type: 'startMission', missionId: 'Q3' }); await game.warm();
    await game.walkTo(ANCHORS.lonely.position);
    await game.talk('可以帮我在这里拍张照吗？', 'passerby', ANCHORS.lonely.id);
    expect(game.state.photo).toBeNull(); // no river viewpoint near this passer-by
    await game.walkTo(ANCHORS.passerby.position);
    await game.talk('可以帮我在这里拍张照吗？', 'passerby');
    expect(game.state.photo?.status).toBe('accepted');
    await game.capture('captured', 422); // no countdown started
    await game.startPhoto(422); // not on the spot yet (passer-by stands 2 m away)
    await game.walkTo(game.state.photo!.spot);
    await game.startPhoto();
    await game.capture('captured', 422); // countdown not finished
    advance(3_100);
    await game.capture('failed');
    expect(game.state.photo).toMatchObject({ status: 'accepted', attempts: 1 });
    expect(game.state.status).toBe('active');
    await game.startPhoto(); advance(3_100);
    await game.capture('captured', 422, ''); // capture acknowledgment needs the image digest
    await game.capture('captured');
    const xp = game.state.xp;
    expect(game.state.status).toBe('cleared');
    await game.act({ type: 'startMission', missionId: 'Q3' }, 422);
    expect(game.state).toMatchObject({ status: 'cleared', photo: { status: 'captured' }, xp });
  });
});
