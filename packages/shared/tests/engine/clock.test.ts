import { describe, expect, it } from 'vitest';
import { baselineInternalState, baselineTurnProvenance, BASELINE_NOW_MS } from '../../src/fixtures.js';
import { advanceClock } from '../../src/engine/clock.js';
import { InternalStateSchema, type InternalState } from '../../src/contracts.js';

function timed(boss = false): InternalState {
  return { ...structuredClone(baselineInternalState), missionId: boss ? 'B1' : 'P2', mode: boss ? 'boss' : 'practice', timer: { initialMs: 180_000, remainingMs: 180_000, lastUpdatedAtMs: BASELINE_NOW_MS, pauseReasons: [], freezeRemainingMs: 0 } };
}

describe('authoritative bounded clock', () => {
  it('excludes exactly eight seconds of provider waiting even if no callback arrives', () => {
    const state = timed(true);
    state.pendingTurn = structuredClone(baselineTurnProvenance);
    state.timer!.pauseReasons = ['provider'];
    const next = advanceClock(state, BASELINE_NOW_MS + 10_000);
    expect(next.timer!.remainingMs).toBe(178_000);
    expect(next.timer!.pauseReasons).toEqual([]);
    expect(state.timer!.remainingMs).toBe(180_000);
    expect(advanceClock(next, BASELINE_NOW_MS + 11_000).timer!.remainingMs).toBe(177_000);
  });

  it('bounds speech by duration plus two seconds and expires its operation', () => {
    const state = timed(true);
    state.audioOperations = [{ id: 'play-1', attemptId: state.attemptId, kind: 'playback', phase: 'playing', speechId: 'speech-1', assetDurationMs: 3_000, registeredAtMs: BASELINE_NOW_MS, phaseStartedAtMs: BASELINE_NOW_MS, phaseDeadlineMs: BASELINE_NOW_MS + 5_000, finished: false }];
    state.activeAudioOperationId = 'play-1';
    const next = advanceClock(state, BASELINE_NOW_MS + 6_000);
    expect(next.timer!.remainingMs).toBe(179_000);
    expect(next.activeAudioOperationId).toBeNull();
    expect(next.audioOperations[0]?.finished).toBe(true);
    expect(InternalStateSchema.safeParse(next).success).toBe(true);
  });

  it('suspends freeze allowance during coach pauses, then consumes exactly 20 seconds', () => {
    const state = timed();
    state.timer!.freezeRemainingMs = 20_000;
    state.timer!.pauseReasons = ['practice-coach', 'freeze'];
    const paused = advanceClock(state, BASELINE_NOW_MS + 30_000);
    expect(paused.timer!.freezeRemainingMs).toBe(20_000);
    paused.timer!.pauseReasons = ['freeze'];
    const resumed = advanceClock(paused, BASELINE_NOW_MS + 55_000);
    expect(resumed.timer!.freezeRemainingMs).toBe(0);
    expect(resumed.timer!.remainingMs).toBe(175_000);
  });

  it('bounds confirmation and PA, consumes cooldown, and has no tab pause', () => {
    const state = timed(true);
    state.npcState.laozhou.cooldownRemainingMs = 10_000;
    state.audioOperations = [{ id: 'record-1', attemptId: state.attemptId, kind: 'recording', phase: 'confirming', registeredAtMs: BASELINE_NOW_MS, phaseStartedAtMs: BASELINE_NOW_MS, phaseDeadlineMs: BASELINE_NOW_MS + 20_000, finished: false }];
    state.activeAudioOperationId = 'record-1';
    state.cuePlaybacks = [{ id: 'pa-1', attemptId: state.attemptId, cueId: 'b1.harbor-change', channel: 'audio', startedAtMs: BASELINE_NOW_MS, deadlineMs: BASELINE_NOW_MS + 5_000, delivered: false, interrupted: false, listeningAssisted: false }];
    const next = advanceClock(state, BASELINE_NOW_MS + 30_000);
    expect(next.timer!.remainingMs).toBe(170_000);
    expect(next.npcState.laozhou.cooldownRemainingMs).toBe(0);
    expect(next.cuePlaybacks[0]?.interrupted).toBe(true);
    expect(advanceClock(next, BASELINE_NOW_MS + 210_000).timer!.remainingMs).toBe(0);
    expect(() => advanceClock(next, BASELINE_NOW_MS)).toThrow('monotonic');
  });
});
