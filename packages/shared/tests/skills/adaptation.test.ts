import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction, applyEvaluation, createGame, projectPublicState, synchronizeGame } from '../../src/engine/index.js';
import { baselineEvaluation } from '../../src/fixtures.js';
import { selectPracticeTier, updateSkillsAfterAttempt } from '../../src/engine/skills.js';
import { DebriefSchema, InternalStateSchema, type EvidenceRecord, type InternalState, type Track } from '../../src/contracts.js';

const fresh = () => createGame({ sessionId: 'skills-session', attemptId: 'attempt-1', missionId: 'P2', initialTier: 1, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture' }, 0);
function unit(state: InternalState, track: Track, score: EvidenceRecord['score'] = 1, patch: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return { id: `unit-${state.evidence.length}-${track}`, attemptId: state.attemptId, missionId: state.missionId, track, score, independent: true, firstAttempt: true, validationMode: false, listeningAssisted: false, providerFailure: false,
    ...(track === 'conversation' ? { turnId: `turn-${state.evidence.length}`, conversationSource: 'typed' as const } : { cueId: 'p2.platform-change' as const }), ...patch };
}
const finish = (state: InternalState) => updateSkillsAfterAttempt({ ...state, status: 'cleared' });

describe('evidence-based adaptation', () => {
  const histories = JSON.parse(readFileSync(new URL('../../../../fixtures/skills/histories.json', import.meta.url), 'utf8')) as { name: string; scores: EvidenceRecord['score'][]; expectedMastery: number; expectedCount: number; expectedTier: number }[];
  for (const history of histories) it(history.name, () => {
    let state = fresh();
    for (const [index, score] of history.scores.entries()) {
      state.attemptId = `attempt-${index}`;
      for (const track of ['reading', 'listening', 'repair'] as const) state.evidence.push(unit(state, track, score));
      state = finish(state);
      DebriefSchema.parse(state.debrief);
    }
    for (const track of ['reading', 'listening', 'repair'] as const) {
      expect(state.skills[track].mastery).toBeCloseTo(history.expectedMastery, 12);
      expect(state.skills[track].independentCount).toBe(history.expectedCount);
    }
    expect(selectPracticeTier(state, 'P2')).toBe(history.expectedTier);
    expect(state.tier).toBe(1);
    expect(selectPracticeTier(state, 'B1')).toBe(1);
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
    expect(finish(state).skills.conversation).toEqual({ mastery: 0.42500000000000004, independentCount: 2 });
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
    const state = fresh(); state.unlockedMissionIds = ['P1', 'P2', 'B1'];
    for (const track of ['reading', 'listening', 'repair'] as const) state.skills[track] = { mastery: 1, independentCount: 10 };
    expect(updateSkillsAfterAttempt(state)).toBe(state);
    expect(projectPublicState(state, 0).debrief).toBeUndefined();
    expect(applyAction(state, { type: 'retryMission' }, 0).state).toMatchObject({ tier: 2, difficulty: 2 });
    expect(applyAction(state, { type: 'startMission', missionId: 'B1' }, 0).state.tier).toBe(1);
    state.difficulty = 2; expect(selectPracticeTier(state, 'P2')).toBe(2);
    state.difficulty = 0;
    for (const track of ['reading', 'listening', 'repair'] as const) state.skills[track].mastery = 0;
    expect(selectPracticeTier(state, 'P2')).toBe(0);
  });
  it('records a confident incorrect request once and cannot farm a corrected or repeated confirmation', () => {
    let state = fresh(); state.zoneId = 'concourse'; state.position = { x: -3, z: 0 }; state.nodeId = 'p2.conversation';
    const turn = (id: string, destination: 'airport' | 'jiangbin') => {
      state.pendingTurn = { turnId: id, sessionId: state.sessionId, attemptId: state.attemptId, npcId: 'achen', text: '去江滨', source: 'typed', assisted: false, createdAtMs: 0 };
      state = applyEvaluation(state, 'achen', { ...baselineEvaluation, intent: 'ask_direction', slots: [{ key: 'destination', value: destination }], coach: null }, 0).state;
    };
    turn('wrong', 'airport'); turn('corrected', 'jiangbin');
    const result = finish(state);
    expect(result.skills.reading.mastery).toBeCloseTo(0.3);
    expect(result.skills.conversation).toMatchObject({ independentCount: 1 });
    expect(result.skills.conversation.mastery).toBeCloseTo(0.3);
    expect(result.debrief!.evidenceSummary.typedTurns).toBe(2);
  });
  it('awards ambiguous independent repair only when no example answer was supplied', () => {
    for (const coached of [false, true]) {
      let state = fresh(); state.zoneId = 'concourse'; state.position = { x: -3, z: 0 }; state.nodeId = 'p2.conversation';
      for (const [i, slots] of [[], [{ key: 'destination' as const, value: 'jiangbin' as const }]].entries()) {
        state.pendingTurn = { turnId: `repair-${i}`, sessionId: state.sessionId, attemptId: state.attemptId, npcId: 'achen', text: '去江滨', source: 'typed', assisted: false, createdAtMs: 0 };
        state = applyEvaluation(state, 'achen', { ...baselineEvaluation, intent: 'ask_direction', slots, coach: coached ? baselineEvaluation.coach : null }, 0).state;
      }
      const result = finish(state);
      expect(result.skills.repair.independentCount).toBe(coached ? 0 : 1);
      expect(result.skills.repair.mastery).toBeCloseTo(coached ? 0.4 : 0.425);
    }
  });
  it('enforces exact promotion/demotion thresholds over the authored target tracks', () => {
    const state = fresh();
    for (const track of ['reading', 'listening', 'repair'] as const) state.skills[track] = { mastery: 0.65, independentCount: 1 };
    expect(selectPracticeTier(state, 'P2')).toBe(2);
    state.skills.repair.independentCount = 0;
    expect(selectPracticeTier(state, 'P2')).toBe(1);
    for (const track of ['reading', 'listening', 'repair'] as const) state.skills[track].mastery = 0.35;
    expect(selectPracticeTier(state, 'P2')).toBe(1);
    for (const track of ['reading', 'listening', 'repair'] as const) state.skills[track].mastery = 0.349;
    expect(selectPracticeTier(state, 'P2')).toBe(0);
  });
  it('deduplicates assisted cue replays and never promotes an assisted first decision', () => {
    const state = fresh();
    state.evidence = [unit(state, 'listening', 1, { independent: false, listeningAssisted: true }), unit(state, 'listening', 1, { id: 'replayed-subtitles', independent: false, listeningAssisted: true }), unit(state, 'listening', 1, { id: 'later-audio' })];
    const result = finish(state);
    expect(result.skills.listening.independentCount).toBe(0);
    expect(result.debrief!.evidenceSummary).toMatchObject({ independentListening: 0, assistedListening: 1 });
  });
  it('runs terminal updates for boss timeout but keeps active boss debrief absent', () => {
    const boss = createGame({ sessionId: 'boss-skills', attemptId: 'boss-attempt', missionId: 'B1', initialTier: 0, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture' }, 0);
    expect(projectPublicState(boss, 0).debrief).toBeUndefined();
    const ended = synchronizeGame(boss, 180000).state;
    expect(ended.skillUpdatedAttemptIds).toEqual(['boss-attempt']);
    expect(projectPublicState(ended, 180000).debrief).toBeDefined();
    expect(ended.tier).toBe(1);
  });
});
