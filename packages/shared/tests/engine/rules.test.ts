import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGame, applyAction, applyEvaluation, projectPublicState, synchronizeGame, dialogueContext, groundedReply } from '../../src/engine/index.js';
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
