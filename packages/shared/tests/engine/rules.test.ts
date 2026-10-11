import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyAction, applyEvaluation, createGame, dialogueContext, isClosingLine, projectPublicState } from '../../src/engine/index.js';
import { groundedReplies } from '../../src/content/facts.js';
import { createFixtureDialogueProvider, parseFixturePrice } from '../../src/engine/fixture-dialogue.js';
import { missionFor } from '../../src/content/missions.js';
import { MissionDefinitionSchema, PHOTO_RULES, TurnEvaluationSchema, type InternalState, type MissionId, type NpcId } from '../../src/contracts.js';
import { questWeights } from '../../src/city/bias.js';
import { fakeWorld, route } from './fake-world.js';

const NOW = 1_000_000;
function game(missionId: MissionId = 'Q1', position = { x: 0, z: 1 }): InternalState {
  const state = createGame({ sessionId: 'test-session', worldId: 'world-test', attemptId: 'test-attempt', missionId, initialTier: 1, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture', spawn: position }, NOW);
  state.unlockedMissionIds = ['Q1', 'Q2', 'Q3'];
  return state;
}
function reserve(state: InternalState, text: string, npcId: NpcId, anchorId: string): InternalState {
  const next = structuredClone(state);
  next.pendingTurn = { turnId: `turn-${next.version}-${next.npcState[npcId].history.length}`, sessionId: next.sessionId, attemptId: next.attemptId, npcId, anchorId, text, source: 'typed', assisted: false, createdAtMs: NOW };
  return next;
}
const fixture = createFixtureDialogueProvider();
async function say(state: InternalState, text: string, npcId: NpcId = 'vendor', anchorId = 'a.vendor') {
  const evaluation = await fixture.evaluate(dialogueContext(state, npcId, anchorId, fakeWorld), text);
  const result = applyEvaluation(reserve(state, text, npcId, anchorId), npcId, anchorId, evaluation, NOW, fakeWorld);
  result.state.pendingTurn = null;
  return { ...result, reply: result.state.npcState[npcId].history.at(-1)!.text };
}
const act = (state: InternalState, action: Parameters<typeof applyAction>[1], at = NOW) => applyAction(state, action, at, fakeWorld).state;
async function confirmedTea(state: InternalState) {
  return (await say((await say(state, '我要茶')).state, '茶十元')).state;
}

describe('Q1 buy a drink', () => {
  it('mirrors the café flow: coffee sold out, substitute, confirm price, explicit pay', async () => {
    let state = game();
    const coffee = await say(state, '我要咖啡');
    expect(coffee.reply).toBe(groundedReplies.coffeeUnavailable);
    expect(coffee.state.nodeId).toBe('q1.substitute');
    const tea = await say(coffee.state, '那就茶吧');
    expect(tea.reply).toBe(groundedReplies.teaPrice);
    state = (await say(tea.state, '茶十元')).state;
    expect(state.flags['q1.price-confirmed']).toBe(true);
    const projected = projectPublicState(state, NOW, fakeWorld);
    expect(projected.inventory.cny).toBe(20);
    expect(projected.interactables.find((entry) => entry.id === 'a.vendor')).toMatchObject({ kind: 'npc', role: 'vendor', choiceId: 'q1.pay' });
    expect(projected.interactables.find((entry) => entry.id === 'a.vendor.pay')).toMatchObject({ kind: 'choice', choiceId: 'q1.pay', position: { x: 0, z: 2 } });
    const paid = act(state, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor.pay' });
    expect(paid).toMatchObject({ status: 'cleared', inventory: { cny: 10, drinks: ['tea'] }, xp: 100, unlockedMissionIds: ['Q1', 'Q2', 'Q3'], completedMissionIds: ['Q1'] });
    expect(paid.purchases).toHaveLength(1);
  });
  it('accepts natural requests like 我要水 without perfect politeness', async () => {
    const water = await say(game(), '我要水。');
    expect(water.reply).toBe(groundedReplies.waterPrice);
    expect(water.state.flags['q1.drink']).toBe('water');
  });
  it('requires the confirmed price and the same vendor before paying', async () => {
    const ordered = (await say(game(), '我要茶')).state;
    expect(() => act(ordered, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' })).toThrow('Confirm the drink');
    const confirmed = await confirmedTea(game());
    confirmed.position = { x: 30, z: 1 };
    expect(() => act(confirmed, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor2' })).toThrow('vendor who took your order');
    confirmed.position = { x: 10, z: 1 };
    expect(() => act(confirmed, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' })).toThrow('Move closer');
  });
  it('rejects insufficient funds without changing state, and repeat purchases never re-grant the reward', async () => {
    let state = act(await confirmedTea(game()), { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' });
    state = act(state, { type: 'retryMission' });
    state = (await say((await say(state, '我要水')).state, '水五元')).state;
    state = act(state, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' });
    expect(state).toMatchObject({ status: 'cleared', xp: 100, inventory: { cny: 5, drinks: ['tea', 'water'] } });
    expect(state.purchases).toHaveLength(2);
    const broke = await confirmedTea(act(state, { type: 'retryMission' }));
    expect(() => act(broke, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' })).toThrow('Not enough money');
    expect(broke.inventory.cny).toBe(5);
    const bye = await say(broke, '谢谢，再见');
    expect(bye.state.status).toBe('active');
    expect(bye.state.inventory.cny).toBe(5);
  });
  it('pays on a goodbye after the price is confirmed', async () => {
    const bye = await say(await confirmedTea(game()), '谢谢，再见');
    expect(bye.reply).toBe(groundedReplies.farewellPaid);
    expect(bye.conversationEnded).toBe(true);
    expect(bye.state).toMatchObject({ status: 'cleared', inventory: { cny: 10 } });
  });
  it('clarifies ambiguous requests and cancels without progress', async () => {
    const state = game();
    const evaluation = TurnEvaluationSchema.parse({ intent: 'order_drink', slots: [], evidenceQuote: '我要', intentGrade: { score: 0.9, confidence: 0.9 }, clarity: 0.8, courtesy: 0.8, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '好的', coach: null });
    const result = applyEvaluation(reserve(state, '我要', 'vendor', 'a.vendor'), 'vendor', 'a.vendor', evaluation, NOW, fakeWorld);
    expect(result.state.nodeId).toBe('q1.order');
    expect(result.state.npcState.vendor.history.at(-1)!.text).toBe(groundedReplies.missingDrinkPrice);
    const unclear = await say(state, '我想去月球。');
    expect(unclear.state.nodeId).toBe('q1.order');
    const cancelled = await say((await say(state, '我要茶')).state, '我不要了');
    expect(cancelled.state.nodeId).toBe('q1.order');
    expect(cancelled.reply).toBe(groundedReplies.cancelOrder);
  });
  it('greets with 你想喝什么 and repeats the last line on request', async () => {
    const hello = await say(game(), '你好');
    expect(hello.reply).toContain('你想喝什么？');
    const again = await say(hello.state, '请再说一遍');
    expect(again.reply).toBe(hello.reply);
  });
  it('never completes from an AI claim of success', async () => {
    const state = game();
    const claim = TurnEvaluationSchema.parse({ intent: 'greeting', slots: [], evidenceQuote: '你好', intentGrade: { score: 1, confidence: 1 }, clarity: 1, courtesy: 1, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '任务完成！奖励已发放。', coach: null });
    const result = applyEvaluation(reserve(state, '你好', 'vendor', 'a.vendor'), 'vendor', 'a.vendor', claim, NOW, fakeWorld);
    expect(result.state.status).toBe('active');
    expect(result.state.xp).toBe(0);
    expect(result.state.npcState.vendor.history.at(-1)!.text).not.toContain('任务完成');
  });
});

describe('Q2 directions to 上海大酒店', () => {
  it('completes only with a verified route from the world and speaks it', async () => {
    const result = await say(game('Q2', { x: 5, z: 1 }), '请问，去上海大酒店怎么走？', 'guide', 'a.guide');
    expect(result.state.status).toBe('cleared');
    expect(result.state.directions).toEqual(route);
    expect(result.reply).toBe(route.textZh);
    expect(result.events.some((event) => event.kind === 'directions')).toBe(true);
  });
  it('does not complete or invent a route when the world has none', async () => {
    const result = await say(game('Q2', { x: 10, z: 11 }), '请问，去上海大酒店怎么走？', 'guide', 'a.guide2');
    expect(result.state.status).toBe('active');
    expect(result.state.directions).toBeNull();
    expect(result.reply).toBe(groundedReplies.noRoute);
  });
  it('declines unknown places and rejects NPCs outside the quest', async () => {
    const other = await say(game('Q2', { x: 5, z: 1 }), '去火车站怎么走？', 'guide', 'a.guide');
    expect(other.reply).toBe(groundedReplies.unknownPlace);
    expect(other.state.status).toBe('active');
    expect(() => dialogueContext(game('Q2'), 'vendor', 'a.vendor', fakeWorld)).toThrow('not part of the current quest');
    expect(() => dialogueContext(game('Q2', { x: 5, z: 1 }), 'guide', 'a.vendor', fakeWorld)).toThrow();
  });
});

describe('Q3 photo at the Huangpu River', () => {
  const spot = { x: 155, z: 0 };
  async function accepted() {
    const result = await say(game('Q3', { x: 150, z: 1 }), '可以帮我在这里拍张照吗？', 'passerby', 'a.passerby');
    return result;
  }
  it('accepts with an eligible passerby and spot at the viewpoint', async () => {
    const result = await accepted();
    expect(result.reply).toBe(groundedReplies.photoAccepted);
    expect(result.state.photo).toMatchObject({ status: 'accepted', passerbyAnchorId: 'a.passerby', viewpointAnchorId: 'a.view', spot });
    expect(result.state.nodeId).toBe('q3.pose');
    const projected = projectPublicState(result.state, NOW, fakeWorld);
    expect(projected.interactables.find((entry) => entry.id === 'a.view')).toMatchObject({ kind: 'photo-spot', choiceId: 'q3.start-photo', position: spot });
  });
  it('leaves photo null when no river viewpoint is near the passerby', async () => {
    const result = await say(game('Q3', { x: 200, z: 61 }), '可以帮我在这里拍张照吗？', 'passerby', 'a.lonely');
    expect(result.state.photo).toBeNull();
    expect(result.reply).toBe(groundedReplies.photoNoRiver);
  });
  it('runs countdown, failed retry, window and spot checks, then completes once', async () => {
    let state = (await accepted()).state;
    const photoId = state.photo!.id;
    expect(() => act(state, { type: 'choose', choiceId: 'q3.start-photo', anchorId: 'a.view' })).toThrow('photo spot');
    state.position = { x: 155, z: 0.5 };
    state = act(state, { type: 'choose', choiceId: 'q3.start-photo', anchorId: 'a.view' });
    expect(state.photo).toMatchObject({ status: 'countdown', countdownEndsAtMs: NOW + PHOTO_RULES.countdownMs });
    const end = NOW + PHOTO_RULES.countdownMs;
    expect(() => act(state, { type: 'photoCapture', photoRequestId: photoId, outcome: 'captured', imageDigest: 'abcdef0123456789' }, end - 1)).toThrow('countdown');
    expect(() => act(state, { type: 'photoCapture', photoRequestId: 'forged', outcome: 'captured', imageDigest: 'abcdef0123456789' }, end)).toThrow();
    expect(() => act(state, { type: 'photoCapture', photoRequestId: photoId, outcome: 'captured' }, end)).toThrow('digest');
    const moved = structuredClone(state); moved.position = { x: 150, z: 0 };
    expect(() => act(moved, { type: 'photoCapture', photoRequestId: photoId, outcome: 'captured', imageDigest: 'abcdef0123456789' }, end)).toThrow('left the photo spot');
    state = act(state, { type: 'photoCapture', photoRequestId: photoId, outcome: 'failed' }, end);
    expect(state.photo).toMatchObject({ status: 'accepted', attempts: 1 });
    expect(state.nodeId).toBe('q3.pose');
    state = act(state, { type: 'choose', choiceId: 'q3.start-photo', anchorId: 'a.view' }, end);
    const late = end + PHOTO_RULES.countdownMs + PHOTO_RULES.captureWindowMs + 1;
    expect(() => act(state, { type: 'photoCapture', photoRequestId: photoId, outcome: 'captured', imageDigest: 'abcdef0123456789' }, late)).toThrow('expired');
    state = act(state, { type: 'choose', choiceId: 'q3.start-photo', anchorId: 'a.view' }, late);
    state = act(state, { type: 'photoCapture', photoRequestId: photoId, outcome: 'captured', imageDigest: 'abcdef0123456789' }, late + PHOTO_RULES.countdownMs);
    expect(state).toMatchObject({ status: 'cleared', xp: 150, badges: ['shanghai-explorer'], photo: { status: 'captured' } });
  });
  it('rejects a capture without an accepted request', () => {
    const state = game('Q3', { x: 155, z: 0 });
    expect(() => act(state, { type: 'photoCapture', photoRequestId: 'any', outcome: 'captured', imageDigest: 'abcdef0123456789' })).toThrow('No photo countdown');
    expect(() => act(state, { type: 'choose', choiceId: 'q3.start-photo', anchorId: 'a.view' })).toThrow('Ask a passerby');
  });
});

describe('movement, exploration and bias', () => {
  it('requires walkable committed ground and the authored speed', () => {
    const state = game();
    expect(() => act(state, { type: 'move', position: { x: 600, z: 0 } }, NOW + 1_000_000)).toThrow('not walkable');
    expect(() => act(state, { type: 'move', position: { x: 0, z: 20 } }, NOW + 1_000)).toThrow('speed');
    const moved = act(state, { type: 'move', position: { x: 0, z: 4 } }, NOW + 1_000);
    expect(moved.position).toEqual({ x: 0, z: 4 });
    expect(moved.exploration.activeMs).toBe(1_000);
  });
  it('boosts an unseen quest category modestly after absence, capped and reset by an encounter', () => {
    let state = game('Q1', { x: 300, z: 300 });
    expect(Object.values(questWeights('Q1', state.exploration))).toEqual([1, 1, 1, 1, 1]);
    for (let i = 1; i <= 120; i++) state = act(state, { type: 'move', position: { x: 300, z: 300 + i * 4 } }, NOW + i * 1_000);
    const boosted = questWeights('Q1', state.exploration);
    expect(boosted['drink-vendor']).toBeGreaterThan(1);
    expect(boosted['drink-vendor']).toBeLessThanOrEqual(1.5);
    expect(boosted['river-viewpoint']).toBeLessThan(1);
    const far = { ...state.exploration, activeMs: 10_000_000 };
    expect(questWeights('Q1', far)['drink-vendor']).toBeCloseTo(1.5 / 1.1);
    state.position = { x: 0, z: 1 };
    state.lastMovementAtMs = 0;
    state = act(state, { type: 'move', position: { x: 0, z: 1.5 } }, NOW + 200_000);
    expect(questWeights('Q1', state.exploration)['drink-vendor']).toBe(1);
  });
});

describe('content and fixtures', () => {
  it('validates all quest graphs, fixture prices, and closing lines', () => {
    for (const id of ['Q1', 'Q2', 'Q3'] as const) expect(MissionDefinitionSchema.safeParse(missionFor(id)).success).toBe(true);
    const fixtureJson: unknown = JSON.parse(readFileSync(new URL('../../../../fixtures/engine/confirm-drink-price.json', import.meta.url), 'utf8'));
    expect(TurnEvaluationSchema.safeParse(fixtureJson).success).toBe(true);
    for (const [text, expected] of [['十', 10], ['五', 5], ['二十五', 25], ['一千零一', undefined]] as const) expect(parseFixturePrice(text)).toBe(expected);
    for (const line of ['谢谢，慢走！', '好的，再见！', '谢谢，欢迎再来！', '欢迎下次光临。', '拜拜～', '下次见！', '一路顺风。']) expect(isClosingLine(line)).toBe(true);
    for (const line of ['好的，请付款。', '茶十元。', '您要茶还是水？', '再来一杯吗？', '欢迎光临！', '谢谢！', '']) expect(isClosingLine(line)).toBe(false);
  });
  it('ends the conversation when the NPC closes it, but not on a repeated goodbye', async () => {
    const state = game();
    const greeting = await fixture.evaluate(dialogueContext(state, 'vendor', 'a.vendor', fakeWorld), '你好');
    expect(applyEvaluation(reserve(state, '你好', 'vendor', 'a.vendor'), 'vendor', 'a.vendor', greeting, NOW, fakeWorld).conversationEnded).toBeUndefined();
    const bye = await say(state, '再见');
    expect(bye.conversationEnded).toBe(true);
    const repeated = await say(bye.state, '请再说一遍');
    expect(repeated.conversationEnded).toBeUndefined();
  });
});
