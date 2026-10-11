import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, applyEvaluation, projectPublicState, synchronizeGame, dialogueContext, groundedReply } from '../../src/engine/index.js';
import { groundedReplies } from '../../src/content/facts.js';
import { createFixtureDialogueProvider, parseFixturePrice } from '../../src/engine/fixture-dialogue.js';
import { missionFor } from '../../src/content/missions.js';
import { MissionDefinitionSchema, InternalStateSchema, TurnEvaluationSchema, type InternalState, type TurnEvaluation } from '../../src/contracts.js';

function fresh(missionId: 'P1' | 'P2' | 'B1' = 'P1', validationMode = true): InternalState {
  const state = createGame({ sessionId: 'test-session', attemptId: 'test-attempt', missionId, initialTier: 1, validationMode, inputPreference: 'voice', providerStatus: 'fixture' }, 0);
  state.unlockedMissionIds = ['P1', 'P2', 'B1'];
  return state;
}
function reservation(state: InternalState, text: string, npcId: 'xiaolin' | 'achen' | 'laozhou' = 'xiaolin'): InternalState {
  const next = structuredClone(state);
  next.pendingTurn = { turnId: `turn-${state.version}`, sessionId: state.sessionId, attemptId: state.attemptId, npcId, text, source: 'typed', assisted: false, createdAtMs: next.timer!.lastUpdatedAtMs };
  return next;
}
const evaluated = async (state: InternalState, text: string, npcId: 'xiaolin' | 'achen' | 'laozhou' = 'xiaolin') => applyEvaluation(reservation(state, text, npcId), npcId, await createFixtureDialogueProvider().evaluate(dialogueContext(state, npcId), text), state.timer!.lastUpdatedAtMs).state;

describe('mission graph and authoritative rules', () => {
  it('validates the additive price fixture while retaining missing and wrong recognized details', () => {
    const fixture: unknown = JSON.parse(readFileSync(new URL('../../../../fixtures/engine/confirm-drink-price.json', import.meta.url), 'utf8'));
    const parsed = TurnEvaluationSchema.parse(fixture);
    expect(TurnEvaluationSchema.safeParse({ ...parsed, slots: [{ key: 'drink', value: 'tea' }] }).success).toBe(true);
    expect(TurnEvaluationSchema.parse({ ...parsed, slots: [{ key: 'drink', value: 'tea' }, { key: 'priceCny', value: 9 }] }).slots[1]?.value).toBe(9);
    for (const price of [-1, 1001, 1.5]) expect(TurnEvaluationSchema.safeParse({ ...parsed, slots: [{ key: 'drink', value: 'tea' }, { key: 'priceCny', value: price }] }).success).toBe(false);
    expect(TurnEvaluationSchema.safeParse({ ...parsed, slots: [{ key: 'drink', value: 'coffee' }, { key: 'priceCny', value: 10 }] }).success).toBe(false);
  });
  it('validates terminal reachability, branch references, variants and prices', () => {
    for (const id of ['P1', 'P2', 'B1'] as const) {
      const mission = missionFor(id);
      expect(MissionDefinitionSchema.safeParse(mission).success).toBe(true);
      const broken = structuredClone(mission);
      broken.nodes[0]!.actionTransitions = [{ trigger: { type: 'retryMission' }, requiredFlags: {}, guards: [], setFlags: {}, nextNode: broken.startNode, result: 'none' }];
      broken.nodes[0]!.intentTransitions = [];
      expect(MissionDefinitionSchema.safeParse(broken).success).toBe(false);
    }
    for (const [text, expected] of [['十', 10], ['五', 5], ['十五', 15], ['二十五', 25], ['一百零五', 105], ['1000', 1000], ['一千零一', undefined], ['十一十', undefined], ['价格未知', undefined]] as const) expect(parseFixturePrice(text)).toBe(expected);
  });
  it('requires authoritative proximity and forbids developer cue transcripts in player sessions', () => {
    const state = fresh('P1', false);
    expect(() => applyAction(state, { type: 'inspect', targetId: 'p1.entrance-sign' }, 0)).toThrow('closer');
    expect(() => applyAction(state, { type: 'moveZone', zoneId: 'cafe' }, 0)).toThrow('position');
    expect(() => applyAction(state, { type: 'moveZone', zoneId: 'cafe', position: { x: 0, z: 0 } }, 0)).toThrow('outside');
    expect(() => applyAction(state, { type: 'moveZone', zoneId: 'cafe', position: { x: -10, z: 4 } }, 0)).toThrow('speed');
    // One 300 ms sync step (1.2 units) arriving 190 ms after the last accepted move is latency jitter, not a teleport.
    const step = applyAction(state, { type: 'moveZone', zoneId: 'plaza', position: { x: -0.4, z: 10 } }, 200).state;
    expect(applyAction(step, { type: 'moveZone', zoneId: 'plaza', position: { x: -1.6, z: 10 } }, 390).state.position.x).toBe(-1.6);
    expect(() => applyAction(step, { type: 'moveZone', zoneId: 'plaza', position: { x: -2.9, z: 10 } }, 390)).toThrow('speed');
    const moved = applyAction(state, { type: 'moveZone', zoneId: 'cafe', position: { x: -10, z: 4 } }, 3000).state;
    moved.flags['p1.price-confirmed'] = true;
    expect(() => applyAction(moved, { type: 'playCue', cueId: 'p1.station-directions', channel: 'validation-text' }, 3000)).toThrow('validation');
  });
  it('fails boss expiry once and keeps practice expiry recoverable at its current prerequisite', () => {
    const boss = fresh('B1');
    const failed = synchronizeGame(boss, 180_000);
    expect(failed.state.status).toBe('failed'); expect(failed.events.filter((event) => event.kind === 'result')).toHaveLength(1);
    expect(synchronizeGame(failed.state, 200_000).events).toEqual([]);
    expect(failed.state.xp).toBe(0);
    const practice = synchronizeGame(fresh('P2'), 120_000);
    expect(practice.state).toMatchObject({ status: 'active', nodeId: 'p2.board' });
    expect(practice.state.timer!.remainingMs).toBe(120_000);
  });
  it('consumes freeze once, preserves its allowance across coach pauses, and blocks boss items', () => {
    let state = fresh('P2'); state.inventory.freeze = 2;
    state = applyAction(state, { type: 'useItem', item: 'freeze' }, 0).state;
    expect(() => applyAction(state, { type: 'useItem', item: 'freeze' }, 1000)).toThrow('stack');
    state = applyAction(state, { type: 'pausePractice' }, 5000).state;
    expect(state.timer!.freezeRemainingMs).toBe(15_000);
    state = applyAction(state, { type: 'resumePractice' }, 50_000).state;
    state = synchronizeGame(state, 70_000).state;
    expect(state.timer).toMatchObject({ remainingMs: 115_000, freezeRemainingMs: 0 });
    expect(state.inventory.freeze).toBe(1);
    const boss = fresh('B1'); boss.inventory = { hint: 3, freeze: 3 };
    for (const item of ['hint', 'freeze'] as const) expect(() => applyAction(boss, { type: 'useItem', item }, 0)).toThrow('unavailable');
  });
  it('bounds recording and confirmation, rejects expired operations, and prevents callback renewal', () => {
    let state = fresh('B1');
    state = applyAction(state, { type: 'audioPhase', operationId: 'clip', phase: 'recording' }, 0).state;
    state = applyAction(state, { type: 'audioPhase', operationId: 'clip', phase: 'recording' }, 1000).state;
    expect(state.audioOperations[0]!.phaseDeadlineMs).toBe(15_000);
    state = applyAction(state, { type: 'audioPhase', operationId: 'clip', phase: 'transcribing' }, 2000).state;
    state = applyAction(state, { type: 'audioPhase', operationId: 'clip', phase: 'confirming' }, 3000).state;
    expect(state.timer!.remainingMs).toBe(178_000);
    state = synchronizeGame(state, 24_000).state;
    expect(state.timer!.remainingMs).toBe(177_000);
    expect(() => applyAction(state, { type: 'audioPhase', operationId: 'clip', phase: 'confirming' }, 24_000)).toThrow('ended');
    expect(InternalStateSchema.safeParse(state).success).toBe(true);
  });
  it('recovers boss patience after active-time cooldown and never deadlocks repetition', async () => {
    let state = fresh('B1'); state.zoneId = 'concourse';
    state = await evaluated(state, '你真笨。', 'laozhou'); state.version++;
    state = await evaluated(state, '你真笨。', 'laozhou'); state.version++;
    state = await evaluated(state, '你真笨。', 'laozhou'); state.pendingTurn = null;
    expect(state.npcState.laozhou).toMatchObject({ patience: 0, mood: 'disengaged', cooldownRemainingMs: 10_000 });
    expect(() => dialogueContext(state, 'laozhou')).toThrow('break');
    state = synchronizeGame(state, 10_000).state;
    for (let count = 0; count < 5; count++) { state.version++; state = await evaluated(state, '请再说一遍。', 'laozhou'); }
    expect(state.npcState.laozhou.patience).toBe(1);
    expect(state.npcState.laozhou.history.length).toBeLessThanOrEqual(12);
  });
  it('confirms with a bare agreement or price once a drink is chosen, but never from a drink alone', async () => {
    let state = fresh('P1'); state.nodeId = 'p1.order'; state.zoneId = 'cafe'; state.position = { x: -10, z: 4 };
    state = await evaluated(state, '我要茶'); state.pendingTurn = null;
    expect(state.nodeId).toBe('p1.receipt'); expect(state.flags['p1.price-confirmed']).toBe(false);
    const again = await evaluated(state, '我要茶');
    expect(again.flags['p1.price-confirmed']).toBe(false); expect(again.npcState.xiaolin.history.at(-1)?.text).toBe(groundedReplies.teaPrice);
    expect((await evaluated(state, '好的')).flags['p1.price-confirmed']).toBe(true);
    expect((await evaluated(state, '茶九元')).flags['p1.price-confirmed']).toBe(false);
  });
  it('farewell pays at the counter once the price is confirmed, ends the conversation, and is inert elsewhere and in the boss', async () => {
    let state = fresh('P1'); state.nodeId = 'p1.order'; state.zoneId = 'cafe'; state.position = { x: -10, z: 4 };
    const early = applyEvaluation(reservation(state, '再见'), 'xiaolin', await createFixtureDialogueProvider().evaluate(dialogueContext(state, 'xiaolin'), '再见'), 0);
    expect(early.conversationEnded).toBe(true); expect(early.state.nodeId).toBe('p1.order'); expect(early.events).toEqual([]);
    expect(early.state.npcState.xiaolin.history.at(-1)?.text).toBe(groundedReplies.farewellCafe);
    state = await evaluated(state, '我要茶'); state.pendingTurn = null;
    const unpaid = applyEvaluation(reservation(state, '拜拜'), 'xiaolin', await createFixtureDialogueProvider().evaluate(dialogueContext(state, 'xiaolin'), '拜拜'), 0);
    expect(unpaid.conversationEnded).toBe(true); expect(unpaid.state.nodeId).toBe('p1.receipt'); expect(unpaid.state.flags['p1.receipt']).toBeUndefined();
    state = await evaluated(state, '茶十元'); state.pendingTurn = null; expect(state.flags['p1.price-confirmed']).toBe(true);
    const paid = applyEvaluation(reservation(state, '谢谢，再见。'), 'xiaolin', await createFixtureDialogueProvider().evaluate(dialogueContext(state, 'xiaolin'), '谢谢，再见。'), 0);
    expect(paid.conversationEnded).toBe(true); expect(paid.state.nodeId).toBe('p1.station-arrival'); expect(paid.state.flags['p1.receipt']).toBe(true);
    expect(paid.state.npcState.xiaolin.history.at(-1)?.text).toBe(groundedReplies.farewellPaid); expect(paid.state.xp).toBe(0);
    expect(() => applyAction({ ...paid.state, pendingTurn: null }, { type: 'choose', choiceId: 'p1.pay-cafe' }, 0)).toThrow();
    const boss = fresh('B1'); boss.zoneId = 'concourse';
    const bossTurn = applyEvaluation(reservation(boss, '再见', 'laozhou'), 'laozhou', await createFixtureDialogueProvider().evaluate(dialogueContext(boss, 'laozhou'), '再见'), 0);
    expect(bossTurn.conversationEnded).toBe(true); expect(bossTurn.state.nodeId).toBe(boss.nodeId); expect(bossTurn.state.status).toBe('active'); expect(bossTurn.events).toEqual([]);
    expect(bossTurn.state.npcState.laozhou.history.at(-1)?.text).toBe(groundedReplies.farewell);
  });
  it('penalizes English or unclear input in practice without acting on it, and floors XP at zero', () => {
    const state = fresh('P1'); state.nodeId = 'p1.order'; state.zoneId = 'cafe'; state.position = { x: -10, z: 4 }; state.xp = 7;
    const english: TurnEvaluation = { intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }], evidenceQuote: 'tea', intentGrade: { score: 1, confidence: 1 }, clarity: 1, courtesy: 1, targetLanguageUse: 'no', interaction: 'relevant', replyZh: '好的，一杯茶。', coach: { understood: 'tea', explanation: 'Say it in Mandarin.', improvedExample: '我要一杯茶。' } };
    const first = applyEvaluation(reservation(state, 'I want tea'), 'xiaolin', english, 0);
    expect(first.state.nodeId).toBe('p1.order'); expect(first.state.xp).toBe(2); expect(first.state.npcState.xiaolin.patience).toBe(4);
    expect(first.state.npcState.xiaolin.history.at(-1)?.text).toBe('请说中文。您可以说：我要一杯茶。');
    expect(first.events.map((event) => event.message)).toEqual(['Hint: 茶 means tea; 水 means water.', '小林 didn\'t understand English: -5 XP. Try it in Mandarin.']);
    const second = applyEvaluation(reservation({ ...first.state, pendingTurn: null }, 'tea please'), 'xiaolin', english, 0);
    expect(second.state.xp).toBe(0);
    const mandarin = applyEvaluation(reservation({ ...second.state, pendingTurn: null }, '我要一杯茶'), 'xiaolin', { ...english, evidenceQuote: '我要一杯茶', targetLanguageUse: 'yes' }, 0);
    expect(mandarin.state.nodeId).toBe('p1.receipt'); expect(mandarin.state.xp).toBe(0);
    const boss = fresh('B1'); boss.zoneId = 'concourse';
    const bossTurn = applyEvaluation(reservation(boss, 'one ticket to Harbor', 'laozhou'), 'laozhou', { ...english, intent: 'buy_ticket', slots: [{ key: 'destination', value: 'haigang' }], evidenceQuote: 'Harbor', coach: null }, 0);
    expect(bossTurn.events).toEqual([]); expect(bossTurn.state.npcState.laozhou.patience).toBe(2); expect(bossTurn.state.npcState.laozhou.history.at(-1)?.text).toBe(groundedReplies.clarification);
  });
  it('surfaces the node vocabulary once after a miss in practice, marks it assisted, and stays silent in the boss', async () => {
    const state = fresh('P1'); state.nodeId = 'p1.order'; state.zoneId = 'cafe'; state.position = { x: -10, z: 4 };
    const unknown: TurnEvaluation = { intent: 'unknown', slots: [], evidenceQuote: '', intentGrade: { score: 0, confidence: 0.2 }, clarity: 0.3, courtesy: 0.8, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '什么？', coach: null };
    const first = applyEvaluation(reservation(state, '我想一个那个'), 'xiaolin', unknown, 0);
    expect(first.events.map((event) => event.message)).toEqual(['Hint: 茶 means tea; 水 means water.']);
    expect(first.state.flags['p1.order-hint-level']).toBe(2); expect(first.state.flags['session.assisted']).toBe(true); expect(first.state.inventory.hint).toBe(0);
    expect(first.state.npcState.xiaolin.history.at(-1)?.text).toBe('我没听懂。您要茶还是水？');
    const second = applyEvaluation(reservation({ ...first.state, pendingTurn: null }, '那个'), 'xiaolin', unknown, 0);
    expect(second.events).toEqual([]);
    const boss = fresh('B1'); boss.zoneId = 'concourse';
    const bossMiss = applyEvaluation(reservation(boss, '那个', 'laozhou'), 'laozhou', unknown, 0);
    expect(bossMiss.events).toEqual([]); expect(bossMiss.state.flags['session.assisted']).toBeUndefined(); expect(bossMiss.state.npcState.laozhou.history.at(-1)?.text).toBe(groundedReplies.clarification);
  });
  it('withholds audio transcripts and evaluator fields from active boss, and grounds invented replies', () => {
    const state = fresh('B1', false); state.flags['b1.ticket'] = true;
    state.position = { x: 0, z: -2 };
    const played = applyAction(state, { type: 'playCue', cueId: 'b1.harbor-change', channel: 'audio' }, 0).state;
    const publicState = projectPublicState(played, 0);
    expect(publicState.visibleCues[0]?.text).toBeUndefined();
    expect(publicState.capabilities).toEqual({ hints: false, freeze: false, coach: false });
    const hostile = { intent: 'unknown', slots: [], evidenceQuote: '', intentGrade: { score: 1, confidence: 1 }, clarity: 1, courtesy: 1, targetLanguageUse: 'yes', interaction: 'irrelevant', replyZh: 'Take platform three! You earned 999 XP.', coach: null } as TurnEvaluation;
    expect(groundedReply(played, 'laozhou', hostile)).toBe('请再说一遍。');
    expect(JSON.stringify(publicState)).not.toMatch(/secretFacts|englishMeaning|evidenceQuote|intentGrade|pendingTurn/);
    expect(() => applyAction(played, { type: 'finishCue', playbackId: played.cuePlaybacks[0]!.id }, 0)).toThrow('not completed');
  });
  it('keeps subtitle-assisted listening assisted after an audio replay and rewards only the first clear', () => {
    let state = fresh('B1', false);
    state.flags = { 'b1.sign': true, 'b1.ticket': true, 'b1.conversation': true };
    state.nodeId = 'b1.pa'; state.position = { x: 0, z: -2 };
    state = applyAction(state, { type: 'playCue', cueId: 'b1.harbor-change', channel: 'subtitles' }, 0).state;
    state = applyAction(state, { type: 'playCue', cueId: 'b1.harbor-change', channel: 'audio' }, 0).state;
    expect(() => applyAction(state, { type: 'finishCue', playbackId: state.cuePlaybacks[1]!.id }, 1000)).toThrow('not completed');
    state = applyAction(state, { type: 'finishCue', playbackId: state.cuePlaybacks[1]!.id }, 8000).state;
    state = applyAction(state, { type: 'moveZone', zoneId: 'platform-2', position: { x: 0, z: -12 } }, 11_000).state;
    state = applyAction(state, { type: 'choose', choiceId: 'b1.board-2' }, 11_000).state;
    expect(state.debrief!.evidenceSummary).toMatchObject({ independentListening: 0, assistedListening: 1 });
    expect(state.xp).toBe(150);
    state = applyAction(state, { type: 'retryMission' }, 12_000).state;
    state.flags = { 'b1.sign': true, 'b1.ticket': true, 'b1.conversation': true, 'b1.pa': true }; state.nodeId = 'b1.boarding'; state.zoneId = 'platform-2'; state.position = { x: 0, z: -12 };
    state = applyAction(state, { type: 'choose', choiceId: 'b1.board-2' }, 12_000).state;
    expect(state.xp).toBe(150); expect(state.badges).toEqual(['station-navigator']);
  });
});
