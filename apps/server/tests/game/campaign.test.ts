import { describe, expect, it } from 'vitest';
import { campaign, p1, p2, b1Ticket } from './helpers.js';

describe('real fixture API campaign', () => {
  for (const kiosk of [false, true]) it(`clears all missions through ${kiosk ? 'kiosk' : 'café'} and practice repair`, async () => {
    const game = await campaign();
    await p1(game, kiosk); await p2(game, true, kiosk); await b1Ticket(game);
    await game.move('platform-2'); await game.choose('b1.board-2');
    expect(game.state).toMatchObject({ status: 'cleared', xp: 350, inventory: { hint: 1, freeze: 1 }, badges: ['station-navigator'], validationMode: true });
    expect(game.state.debrief?.evidenceSummary).toMatchObject({ independentListening: 0, assistedListening: 1, spokenTurns: 0 });
    const session = await game.services.sessionStore.get(game.state.sessionId);
    expect(session?.state.evidence.every((unit) => !unit.independent)).toBe(true);
    const rewards = session!.state.awardedRewardIds;
    await game.act({ type: 'retryMission' });
    expect(game.state.status).toBe('active');
    expect((await game.services.sessionStore.get(game.state.sessionId))!.state.awardedRewardIds).toEqual(rewards);
  });
  it('guards payment details, cancellation and branch proximity', async () => {
    const game = await campaign();
    await game.move('cafe'); await game.inspect('p1.entrance-sign'); await game.choose('p1.enter-plaza-door');
    await game.talk('我要茶。'); await game.choose('p1.pay-cafe', 422);
    await game.talk('茶九元。'); await game.choose('p1.pay-cafe', 422);
    await game.talk('茶一千零一元。'); await game.choose('p1.pay-cafe', 422);
    await game.talk('茶十元。'); await game.talk('取消订单。'); await game.choose('p1.pay-cafe', 422);
    await game.talk('我要水。'); await game.choose('p1.pay-kiosk', 422);
    await game.talk('水五元。'); await game.cue('p1.station-directions'); await game.choose('p1.pay-kiosk', 422);
    await game.move('kiosk'); await game.choose('p1.pay-kiosk');
    expect(game.state.status).toBe('active'); await game.move('concourse'); expect(game.state.status).toBe('cleared');
  });
  it('rejects boss assistance and skipped gates, and wrong boarding fails exactly once', async () => {
    const game = await campaign(); await p1(game); await p2(game);
    await game.act({ type: 'startMission', missionId: 'B1' });
    await game.talk('我要一张去海港的票。', 'laozhou'); await game.choose('b1.pay-ticket', 422);
    await game.inspect('b1.destination-board'); await game.talk('one ticket to Harbor', 'laozhou'); await game.choose('b1.pay-ticket', 422);
    await game.talk('我要一张去海港的票。', 'laozhou'); await game.talk('海港，一张。', 'laozhou'); await game.choose('b1.pay-ticket');
    await game.move('platform-2'); await game.choose('b1.board-2', 422); await game.move('concourse');
    for (const action of [{ type: 'useItem', item: 'hint' }, { type: 'useItem', item: 'freeze' }, { type: 'pausePractice' }] as const) await game.act(action, 422);
    await game.cue('b1.harbor-change'); await game.move('platform-1'); await game.choose('b1.board-1');
    expect(game.state.status).toBe('failed'); expect(game.state.xp).toBe(200);
    const oldAttempt = (await game.services.sessionStore.get(game.state.sessionId))!.state.attemptId;
    await game.act({ type: 'retryMission' });
    expect((await game.services.sessionStore.get(game.state.sessionId))!.state.attemptId).not.toBe(oldAttempt);
    expect(game.state).toMatchObject({ status: 'active', xp: 200 });
    const raw = JSON.stringify(game.state);
    for (const hidden of ['secretFacts', 'evidence', 'replyZh', 'englishMeaning', 'ticket-ready', 'cooldownRemainingMs']) expect(raw).not.toContain(hidden);
  });
});
