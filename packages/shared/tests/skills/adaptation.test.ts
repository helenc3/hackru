import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction, applyEvaluation, createGame, projectPublicState } from '../../src/engine/index.js';
import { fakeWorld } from '../engine/fake-world.js';
import { baselineEvaluation } from '../../src/fixtures.js';
import { selectPracticeTier, updateSkillsAfterAttempt } from '../../src/engine/skills.js';
import { DebriefSchema, InternalStateSchema, type EvidenceRecord, type InternalState, type Track } from '../../src/contracts.js';

// Conversational pacing (the goal warm-up) is covered in rules.test.ts; skip it here.
const fresh = () => {
  const state = createGame({ sessionId: 'skills-session', worldId: 'world-test', spawn: { x: 0, z: 1 }, attemptId: 'attempt-1', missionId: 'Q1', initialTier: 1, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture' }, 0);
  for (const role of ['vendor', 'guide', 'passerby']) state.flags[`session.warmed-${role}`] = true;
  return state;
};
function unit(state: InternalState, track: Track, score: EvidenceRecord['score'] = 1, patch: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return { id: `unit-${state.evidence.length}-${track}`, attemptId: state.attemptId, missionId: state.missionId, track, score, independent: true, firstAttempt: true, validationMode: false, listeningAssisted: false, providerFailure: false,
    ...(track === 'conversation' ? { turnId: `turn-${state.evidence.length}`, conversationSource: 'typed' as const } : { cueId: 'q1.menu' as const }), ...patch };
}
const finish = (state: InternalState) => updateSkillsAfterAttempt({ ...state, status: 'cleared' });

describe('evidence-based adaptation', () => {
  const histories = JSON.parse(readFileSync(new URL('../../../../fixtures/skills/histories.json', import.meta.url), 'utf8')) as { name: string; scores: EvidenceRecord['score'][]; expectedMastery: number; expectedCount: number; expectedTier: number }[];
  for (const history of histories) it(history.name, () => {
    let state = fresh();
    for (const [index, score] of history.scores.entries()) {
      state.attemptId = `attempt-${index}`;
      for (const track of ['reading', 'conversation'] as const) state.evidence.push(unit(state, track, score));
      state = finish(state);
      DebriefSchema.parse(state.debrief);
    }
    for (const track of ['reading', 'conversation'] as const) {
      expect(state.skills[track].mastery).toBeCloseTo(history.expectedMastery, 12);
      expect(state.skills[track].independentCount).toBe(history.expectedCount);
    }
    expect(selectPracticeTier(state, 'Q1')).toBe(history.expectedTier);
    expect(state.tier).toBe(1);
  });
  it('averages the mission once and ignores duplicate cues, old attempts, retries and provider failures', () => {
    const state = fresh();
    state.evidence = [unit(state, 'reading', 0), unit(state, 'reading', 1, { id: 'duplicate' }), unit(state, 'listening', 1, { attemptId: 'old' }), unit(state, 'repair', 1, { independent: false, providerFailure: true }), unit(state, 'conversation', 1, { firstAttempt: false })];
    const result = finish(state);
    expect(result.skills.reading).toEqual({ mastery: 0.30000000000000004, independentCount: 1 });
    expect(result.skills.listening.independentCount).toBe(0);
    expect(result.skills.repair.independentCount).toBe(0);
    expect(result.skills.conversation.independentCount).toBe(0);
    expect(updateSkillsAfterAttempt(result)).toEqual(result);
    expect(state.skills.reading.mastery).toBe(0.4);
  });
  it('uses the mean of multiple independent units within one track', () => {
    const state = fresh();
    state.evidence = [unit(state, 'conversation', 1, { turnId: 'one' }), unit(state, 'conversation', 0, { turnId: 'two', id: 'two' })];
    const result = finish(state);
    expect(result.skills.conversation).toEqual({ mastery: 0.42500000000000004, independentCount: 2 });
    expect(result.debrief!.nextPracticeMissionId).toBe('Q1'); // weakest track picks the targeted replay
  });
  it('keeps assisted, subtitle and validation successes separate from mastery and listening evidence', () => {
    for (const validationMode of [false, true]) {
      const state = fresh(); state.validationMode = validationMode;
      state.evidence = [unit(state, 'listening', 1, { independent: false, validationMode, listeningAssisted: !validationMode }), unit(state, 'conversation', 1, { independent: false, validationMode, conversationSource: 'edited' })];
      const result = finish(state);
      expect(result.skills.listening).toEqual({ mastery: 0.4, independentCount: 0 });
      expect(result.debrief!.evidenceSummary).toMatchObject({ independentListening: 0, assistedListening: 1, editedTurns: 1, spokenTurns: 0 });
      expect(result.debrief!.nextPracticeReason).toContain('untested');
      expect(result.debrief!.nextPracticeReason).not.toContain('weak');
      InternalStateSchema.parse(result);
    }
  });
  it('reports spoken, typed and edited turns honestly without treating typed success as speech', () => {
    const state = fresh();
    state.evidence = ['spoken', 'typed', 'edited'].map((source, i) => unit(state, 'conversation', 1, { id: `source-${i}`, turnId: `turn-${i}`, conversationSource: source as EvidenceRecord['conversationSource'] }));
    expect(finish(state).debrief!.evidenceSummary).toMatchObject({ spokenTurns: 1, typedTurns: 1, editedTurns: 1 });
  });
  it('changes at most one tier only when starting practice, preserves untested tracks and bounds tiers', () => {
    const state = fresh(); state.unlockedMissionIds = ['Q1', 'Q2', 'Q3'];
    for (const track of ['reading', 'conversation'] as const) state.skills[track] = { mastery: 1, independentCount: 10 };
    expect(updateSkillsAfterAttempt(state)).toBe(state);
    expect(projectPublicState(state, 0, fakeWorld).debrief).toBeUndefined();
    state.status = 'cleared';
    expect(applyAction(state, { type: 'startMission', missionId: 'Q2' }, 0, fakeWorld).state).toMatchObject({ tier: 2, difficulty: 2 });
    state.difficulty = 2; expect(selectPracticeTier(state, 'Q1')).toBe(2);
    state.difficulty = 0;
    for (const track of ['reading', 'conversation'] as const) state.skills[track].mastery = 0;
    expect(selectPracticeTier(state, 'Q1')).toBe(0);
  });
  const vendorTurn = (state: InternalState, id: string, evaluation: Partial<typeof baselineEvaluation>) => {
    state.pendingTurn = { turnId: id, sessionId: state.sessionId, attemptId: state.attemptId, npcId: 'vendor', anchorId: 'a.vendor', text: '一杯茶', source: 'typed', assisted: false, createdAtMs: 0 };
    return applyEvaluation(state, 'vendor', 'a.vendor', { ...baselineEvaluation, ...evaluation }, 0, fakeWorld).state;
  };
  it('records a confident incorrect request once and cannot farm a corrected confirmation', () => {
    let state = fresh(); state.nodeId = 'q1.buy'; state.flags['q1.drink'] = 'tea';
    state = vendorTurn(state, 'wrong', { intent: 'confirm_drink_price', slots: [{ key: 'drink', value: 'tea' }, { key: 'priceCny', value: 9 }], coach: null });
    // Once the priced drink puts Pay up, the conversation is locked: no corrected confirmation can be farmed.
    expect(() => vendorTurn(state, 'corrected', { intent: 'confirm_drink_price', slots: [{ key: 'drink', value: 'tea' }, { key: 'priceCny', value: 10 }], coach: null })).toThrow(expect.objectContaining({ code: 'GOAL_ACTION_PENDING' }));
    const result = finish(state);
    expect(result.debrief!.evidenceSummary.typedTurns).toBe(1);
  });
  it('awards ambiguous independent repair only when no example answer was supplied', () => {
    for (const coached of [false, true]) {
      let state = fresh();
      state = vendorTurn(state, 'repair-0', { slots: [], coach: coached ? baselineEvaluation.coach : null });
      state = vendorTurn(state, 'repair-1', { coach: coached ? baselineEvaluation.coach : null });
      const result = finish(state);
      expect(result.skills.repair.independentCount).toBe(coached ? 0 : 1);
      expect(result.skills.repair.mastery).toBeCloseTo(coached ? 0.4 : 0.425);
    }
  });
  it('enforces exact promotion/demotion thresholds over the authored target tracks', () => {
    const state = fresh();
    for (const track of ['reading', 'conversation'] as const) state.skills[track] = { mastery: 0.65, independentCount: 2 };
    expect(selectPracticeTier(state, 'Q1')).toBe(2);
    state.skills.conversation.independentCount = 0;
    expect(selectPracticeTier(state, 'Q1')).toBe(1);
    for (const track of ['reading', 'conversation'] as const) state.skills[track].mastery = 0.35;
    expect(selectPracticeTier(state, 'Q1')).toBe(1);
    for (const track of ['reading', 'conversation'] as const) state.skills[track].mastery = 0.349;
    expect(selectPracticeTier(state, 'Q1')).toBe(0);
  });
  it('deduplicates assisted cue replays and never promotes an assisted first decision', () => {
    const state = fresh();
    state.evidence = [unit(state, 'listening', 1, { independent: false, listeningAssisted: true }), unit(state, 'listening', 1, { id: 'replayed-subtitles', independent: false, listeningAssisted: true }), unit(state, 'listening', 1, { id: 'later-audio' })];
    const result = finish(state);
    expect(result.skills.listening.independentCount).toBe(0);
    expect(result.debrief!.evidenceSummary).toMatchObject({ independentListening: 0, assistedListening: 1 });
  });
});
