import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyAction, applyEvaluation, createGame, dialogueContext, GOAL_WARMUP_EXCHANGES, isClosingLine, NPC_PATIENCE_LIMIT, npcActions, pendingGoalAction, projectPublicState, turnActions } from '../../src/engine/index.js';
import { authoredFacts, groundedReplies, impatienceReplies, pacingReplies, smallTalkReplies } from '../../src/content/facts.js';
import { createFixtureDialogueProvider, parseFixturePrice } from '../../src/engine/fixture-dialogue.js';
import { missionFor } from '../../src/content/missions.js';
import { MissionDefinitionSchema, PHOTO_RULES, TurnEvaluationSchema, type InternalState, type MissionId, type NpcId } from '../../src/contracts.js';
import { questWeights } from '../../src/city/bias.js';
import { fakeWorld, route } from './fake-world.js';

const NOW = 1_000_000;
function game(missionId: MissionId = 'Q1', position = { x: 0, z: 1 }): InternalState {
  const state = createGame({ sessionId: 'test-session', worldId: 'world-test', attemptId: 'test-attempt', missionId, initialTier: 1, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture', spawn: position }, NOW);
  state.unlockedMissionIds = ['Q1', 'Q2', 'Q3'];
  // Goal mechanics tests skip the warm-up; the pacing suite below uses unpaced().
  for (const role of ['vendor', 'guide', 'passerby']) state.flags[`session.warmed-${role}`] = true;
  return state;
}
/** retryMission starts a fresh attempt (the warm-up applies again); mechanics tests skip it. */
function skipPacing(state: InternalState): InternalState {
  for (const role of ['vendor', 'guide', 'passerby']) state.flags[`session.warmed-${role}`] = true;
  return state;
}
function unpaced(missionId: MissionId = 'Q1', position = { x: 0, z: 1 }): InternalState {
  const state = game(missionId, position);
  for (const role of ['vendor', 'guide', 'passerby']) delete state.flags[`session.warmed-${role}`];
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
async function orderedTea(state: InternalState) {
  return (await say(state, '我要茶')).state;
}

describe('Q1 buy a drink', () => {
  it('is one goal: coffee is sold out in dialogue, the priced drink enables Pay, the first purchase completes it', async () => {
    let state = game();
    expect(projectPublicState(state, NOW, fakeWorld).objectives).toEqual([{ id: 'q1.buy', label: 'Buy a drink from 老王 (Lao Wang).', complete: false }]);
    const coffee = await say(state, '我要咖啡');
    expect(coffee.reply).toBe(groundedReplies.coffeeUnavailable);
    expect(coffee.state.nodeId).toBe('q1.buy');
    expect(turnActions(coffee.state, 'a.vendor', false)).toEqual([]); // no pay for coffee
    const tea = await say(coffee.state, '那就茶吧');
    expect(tea.reply).toBe(groundedReplies.teaPrice);
    state = tea.state;
    expect(turnActions(state, 'a.vendor', false)).toEqual([{ kind: 'pay', anchorId: 'a.vendor', drink: 'tea', priceCny: 10 }]);
    const projected = projectPublicState(state, NOW, fakeWorld);
    expect(projected.inventory.cny).toBe(20);
    expect(projected.npcActions).toEqual([{ anchorId: 'a.vendor', action: { kind: 'pay', anchorId: 'a.vendor', drink: 'tea', priceCny: 10 } }]);
    expect(projected.interactables.find((entry) => entry.id === 'a.vendor')).toMatchObject({ kind: 'npc', role: 'vendor', choiceId: 'q1.pay' });
    expect(projected.interactables.find((entry) => entry.id === 'a.vendor.pay')).toMatchObject({ kind: 'choice', choiceId: 'q1.pay', position: { x: 0, z: 2 } });
    const paid = act(state, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' });
    expect(paid).toMatchObject({ status: 'cleared', inventory: { cny: 10, drinks: ['tea'] }, xp: 100, unlockedMissionIds: ['Q1', 'Q2', 'Q3'], completedMissionIds: ['Q1'] });
    expect(paid.purchases).toHaveLength(1);
    expect(projectPublicState(paid, NOW, fakeWorld).objectives).toEqual([{ id: 'q1.buy', label: 'Buy a drink from 老王 (Lao Wang).', complete: true }]);
    expect(turnActions(paid, 'a.vendor', false)).toEqual([{ kind: 'end-conversation' }]); // pay disappears after the purchase
  });
  it('accepts natural requests like 我要水 without perfect politeness', async () => {
    const water = await say(game(), '我要水。');
    expect(water.reply).toBe(groundedReplies.waterPrice);
    expect(water.state.flags['q1.drink']).toBe('water');
  });
  it('requires a priced drink and the same vendor before paying', async () => {
    expect(() => act(game(), { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' })).toThrow('Ask the vendor');
    expect(npcActions(game())).toEqual([]);
    const confirmed = await orderedTea(game());
    confirmed.position = { x: 30, z: 1 };
    expect(() => act(confirmed, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor2' })).toThrow('vendor who took your order');
    confirmed.position = { x: 10, z: 1 };
    expect(() => act(confirmed, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' })).toThrow('Move closer');
  });
  it('rejects insufficient funds without changing state, and repeat purchases never re-grant the reward', async () => {
    let state = act(await orderedTea(game()), { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' });
    state = skipPacing(act(state, { type: 'retryMission' }));
    state = (await say(state, '我要水')).state;
    state = act(state, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' });
    expect(state).toMatchObject({ status: 'cleared', xp: 100, inventory: { cny: 5, drinks: ['tea', 'water'] } });
    expect(state.purchases).toHaveLength(2);
    const broke = await orderedTea(skipPacing(act(state, { type: 'retryMission' })));
    expect(() => act(broke, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' })).toThrow('Not enough money');
    expect(broke.inventory.cny).toBe(5);
    const bye = await say(broke, '谢谢，再见');
    expect(bye.state.status).toBe('active');
    expect(bye.state.inventory.cny).toBe(5);
  });
  it('once Pay is up the conversation is over: turns are rejected unchanged, only the button finishes', async () => {
    const ordered = await orderedTea(game());
    expect(pendingGoalAction(npcActions(ordered), ordered.inventory.cny, 'vendor')?.action).toEqual({ kind: 'pay', anchorId: 'a.vendor', drink: 'tea', priceCny: 10 });
    const before = structuredClone(ordered);
    await expect(say(ordered, '谢谢，再见')).rejects.toMatchObject({ code: 'GOAL_ACTION_PENDING' });
    expect(ordered).toEqual(before); // no state change, no patience exchange counted
    expect(act(ordered, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' })).toMatchObject({ status: 'cleared', inventory: { cny: 10 } });
  });
  it('an unaffordable Pay keeps the conversation open', async () => {
    const poor = game(); poor.inventory.cny = 5;
    const ordered = await orderedTea(poor);
    expect(pendingGoalAction(npcActions(ordered), ordered.inventory.cny, 'vendor')).toBeUndefined();
    const bye = await say(ordered, '谢谢，再见');
    expect(bye.conversationEnded).toBe(true);
    expect(turnActions(bye.state, 'a.vendor', true)).toEqual([{ kind: 'pay', anchorId: 'a.vendor', drink: 'tea', priceCny: 10 }, { kind: 'end-conversation' }]);
  });
  it('clarifies ambiguous requests and cancels without progress', async () => {
    const state = game();
    const evaluation = TurnEvaluationSchema.parse({ intent: 'order_drink', slots: [], evidenceQuote: '我要', intentGrade: { score: 0.9, confidence: 0.9 }, clarity: 0.8, courtesy: 0.8, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '好的', coach: null });
    const result = applyEvaluation(reserve(state, '我要', 'vendor', 'a.vendor'), 'vendor', 'a.vendor', evaluation, NOW, fakeWorld);
    expect(result.state.nodeId).toBe('q1.buy');
    expect(result.state.npcState.vendor.history.at(-1)!.text).toBe(groundedReplies.missingDrinkPrice);
    const unclear = await say(state, '我想去月球。');
    expect(unclear.state.nodeId).toBe('q1.buy');
    const short = game(); short.inventory.cny = 5; // an affordable Pay would end the talking; an unaffordable one lets the player cancel
    const cancelled = await say((await say(short, '我要茶')).state, '我不要了');
    expect(cancelled.state.nodeId).toBe('q1.buy');
    expect(npcActions(cancelled.state)).toEqual([]); // cancelling withdraws the Pay button
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
    expect(result.state.missionId).toBe('Q2');
    expect(turnActions(result.state, 'a.guide', false)).toEqual([{ kind: 'show-directions' }, { kind: 'end-conversation' }]);
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
    expect(result.state.nodeId).toBe('q3.photo');
    expect(turnActions(result.state, 'a.passerby', false)).toEqual([{ kind: 'go-to-photo-spot', spot }]);
    await expect(say(result.state, '你好', 'passerby', 'a.passerby')).rejects.toMatchObject({ code: 'GOAL_ACTION_PENDING' }); // only the button now
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
    expect(turnActions(state, 'a.passerby', false)).toEqual([{ kind: 'go-to-photo-spot', spot }]); // retry needs no talking
    expect(state.nodeId).toBe('q3.photo');
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

describe('conversational pacing and small talk', () => {
  const ask = (state: InternalState) => say(state, '我要水');
  const chatty = (state: InternalState, npcId: NpcId = 'vendor', anchorId = 'a.vendor') => say(state, '今天天气很好', npcId, anchorId);
  it('defers goal requests in character before the warm-up; no Pay, no hint, and deferral turns count', async () => {
    let turn = await ask(unpaced());
    expect(turn.reply).toBe(pacingReplies.vendor[0]);
    expect(npcActions(turn.state)).toEqual([]);
    expect(turn.events.some((event) => event.message.startsWith('Hint:'))).toBe(false);
    for (let i = 1; i < GOAL_WARMUP_EXCHANGES - 1; i++) {
      turn = await ask(turn.state);
      expect(turn.reply).toBe(pacingReplies.vendor[i]);
      expect(npcActions(turn.state)).toEqual([]);
    }
    expect(turn.state.flags['q1.exchanges']).toBe(GOAL_WARMUP_EXCHANGES - 1);
  });
  it('delivers a repeated request on the warm-up exchange, and a remembered one on an ordinary turn', async () => {
    let asked = await ask(unpaced());
    for (let i = 1; i < GOAL_WARMUP_EXCHANGES - 1; i++) asked = await chatty(asked.state);
    expect(npcActions(asked.state)).toEqual([]);
    const repeated = await ask(asked.state);
    expect(repeated.reply).toBe(groundedReplies.waterPrice);
    expect(npcActions(repeated.state)[0]!.action).toMatchObject({ kind: 'pay', drink: 'water', priceCny: 5 });
    const steered = await chatty(asked.state); // the NPC comes back to the remembered order itself
    expect(steered.reply).toBe(groundedReplies.waterPrice);
    expect(npcActions(steered.state)[0]!.action).toMatchObject({ kind: 'pay', drink: 'water' });
  });
  it('a player who chats through the warm-up gets the goal on the first request', async () => {
    let chat = await chatty(unpaced());
    expect(smallTalkReplies.vendor).toContain(chat.reply);
    expect(chat.events.some((event) => event.message.startsWith('Hint:'))).toBe(false);
    for (let i = 1; i < GOAL_WARMUP_EXCHANGES - 1; i++) chat = await chatty(chat.state);
    expect((await say(chat.state, '我要茶')).reply).toBe(groundedReplies.teaPrice);
  });
  it('focused players reach every goal before the impatience lines; the guide and passer-by defer too', async () => {
    let guide = await say(unpaced('Q2', { x: 5, z: 1 }), '请问，去上海大酒店怎么走？', 'guide', 'a.guide');
    expect(guide).toMatchObject({ reply: pacingReplies.guide[0] });
    while (guide.state.status === 'active') guide = await say(guide.state, '请问，去上海大酒店怎么走？', 'guide', 'a.guide');
    expect(guide.reply).toBe(guide.state.directions!.textZh);
    expect(guide.state.npcState.guide.history.length / 2).toBe(GOAL_WARMUP_EXCHANGES);
    expect(GOAL_WARMUP_EXCHANGES).toBeLessThan(NPC_PATIENCE_LIMIT - 3);
    let passerby = await say(unpaced('Q3', { x: 150, z: 1 }), '可以帮我在这里拍张照吗？', 'passerby', 'a.passerby');
    expect(passerby.reply).toBe(pacingReplies.passerby[0]);
    for (let i = 1; i < GOAL_WARMUP_EXCHANGES; i++) passerby = await chatty(passerby.state, 'passerby', 'a.passerby');
    expect(passerby.state.photo?.status).toBe('accepted');
  });
  it('a chatty player who never asks fails at the patience limit, warm-up or not', async () => {
    let turn = await chatty(unpaced());
    for (let i = 1; i < NPC_PATIENCE_LIMIT; i++) turn = await chatty(turn.state);
    expect(turn.state.status).toBe('failed');
  });
  it('a model reply claiming success during small talk never completes the quest', () => {
    const state = unpaced();
    const claim = TurnEvaluationSchema.parse({ intent: 'small_talk', slots: [], evidenceQuote: '我买好了', intentGrade: { score: 1, confidence: 1 }, clarity: 1, courtesy: 1, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '好，你已经买好了，任务完成！', coach: null });
    const result = applyEvaluation(reserve(state, '我买好了', 'vendor', 'a.vendor'), 'vendor', 'a.vendor', claim, NOW, fakeWorld);
    expect(result.state.status).toBe('active');
    expect(result.state.purchases).toEqual([]);
    expect(npcActions(result.state)).toEqual([]);
  });
  it('wares and prices in authored lines come only from the facts', () => {
    const numerals: Record<string, number> = { 两: 2, 二: 2, 三: 3, 五: 5, 十: 10 };
    const factText = JSON.stringify(authoredFacts);
    const factPrices = new Set([...factText.matchAll(/([0-9]+|[两二三五十])(?:块|元|"|,)/g)].map((match) => numerals[match[1]!] ?? Number(match[1])));
    const lines = [...Object.values(groundedReplies), ...Object.values(pacingReplies).flat(), ...Object.values(smallTalkReplies).flat()];
    for (const line of lines) {
      for (const match of line.matchAll(/([0-9]+|[两二三五十])块/g)) expect(factPrices, line).toContain(numerals[match[1]!] ?? Number(match[1]));
      for (const ware of ['包子', '烤红薯', '茶叶蛋', '豆浆']) if (line.includes(ware)) expect(authoredFacts['q1.drinks'].otherWares, line).toContain(ware);
    }
  });
});

describe('NPC patience', () => {
  async function chat(state: InternalState, count: number, npcId: NpcId = 'vendor', anchorId = 'a.vendor') {
    let turn = await say(state, '今天天气很好', npcId, anchorId);
    for (let i = 1; i < count; i++) turn = await say(turn.state, '今天天气很好', npcId, anchorId);
    return turn;
  }
  it('shows impatience in character, then walks off at the limit and fails the attempt', async () => {
    const before = await chat(game(), NPC_PATIENCE_LIMIT - 4);
    expect(projectPublicState(before.state, NOW, fakeWorld).npcMood.vendor).toBe('warm');
    const first = await say(before.state, '今天天气很好');
    expect(first.reply.endsWith(impatienceReplies.vendor.first)).toBe(true);
    expect(projectPublicState(first.state, NOW, fakeWorld).npcMood.vendor).toBe('neutral');
    const last = await chat(first.state, 2);
    expect(last.reply.endsWith(impatienceReplies.vendor.last)).toBe(true);
    expect(projectPublicState(last.state, NOW, fakeWorld).npcMood.vendor).toBe('terse');
    expect(last.state.status).toBe('active');
    const gone = await say(last.state, '今天天气很好');
    expect(gone.reply).toBe(impatienceReplies.vendor.leave);
    expect(gone.conversationEnded).toBe(true);
    expect(gone.state.status).toBe('failed');
    expect(gone.events.find((event) => event.kind === 'result')?.message).toMatch(/got tired of chatting/);
    expect(projectPublicState(gone.state, NOW, fakeWorld).npcMood.vendor).toBe('disengaged');
  });
  it('reaching the goal on the last exchange before the limit still completes', async () => {
    const chatted = await chat(game('Q2', { x: 5, z: 1 }), NPC_PATIENCE_LIMIT - 2, 'guide', 'a.guide');
    const done = await say(chatted.state, '请问，去上海大酒店怎么走？', 'guide', 'a.guide');
    expect(done.state.status).toBe('cleared');
  });
  it('a model reply can never trigger failure early', async () => {
    const angry = TurnEvaluationSchema.parse({ intent: 'farewell', slots: [], evidenceQuote: '再见', intentGrade: { score: 1, confidence: 1 }, clarity: 1, courtesy: 1, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '你太烦了，任务失败！', coach: null });
    const result = applyEvaluation(reserve(game(), '再见', 'vendor', 'a.vendor'), 'vendor', 'a.vendor', angry, NOW, fakeWorld);
    expect(result.state.status).toBe('active');
  });
  it('retry starts a fresh conversation and keeps earlier rewards and money', async () => {
    let state = await orderedTea(game());
    state = act(state, { type: 'choose', choiceId: 'q1.pay', anchorId: 'a.vendor' });
    expect(state.status).toBe('cleared');
    const { xp, inventory } = state;
    state = skipPacing(act(state, { type: 'startMission', missionId: 'Q2' }));
    state.position = { x: 5, z: 1 }; // beside the guide
    const failed = await chat(state, NPC_PATIENCE_LIMIT, 'guide', 'a.guide');
    expect(failed.state.status).toBe('failed');
    const retried = act(failed.state, { type: 'retryMission' });
    expect(retried).toMatchObject({ status: 'active', missionId: 'Q2', xp, inventory, completedMissionIds: ['Q1'] });
    expect(retried.flags['q2.exchanges']).toBeUndefined();
    expect(retried.npcState.guide.history).toEqual([]);
  });
});
