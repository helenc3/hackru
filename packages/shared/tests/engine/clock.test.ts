import { describe, expect, it } from 'vitest';
import { advanceClock, createGame } from '../../src/engine/index.js';

const game = () => createGame({ sessionId: 's', worldId: 'w', attemptId: 'a', missionId: 'Q1', initialTier: 1, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture', spawn: { x: 0, z: 0 } }, 0);

describe('untimed quest clock', () => {
  it('drops the provider pause after eight seconds even if no callback arrives', () => {
    const state = game();
    state.pendingTurn = { turnId: 't', sessionId: 's', attemptId: 'a', npcId: 'vendor', anchorId: 'v', text: '你好', source: 'typed', assisted: false, createdAtMs: 1_000 };
    expect(advanceClock(state, 8_999).pauseReasons).toEqual(['provider']);
    expect(advanceClock(state, 9_000).pauseReasons).toEqual([]);
  });
  it('expires an audio operation at its deadline and keeps coach pauses', () => {
    const state = game();
    state.audioOperations = [{ id: 'op', attemptId: 'a', kind: 'playback', phase: 'playing', speechId: 'sp', registeredAtMs: 0, phaseStartedAtMs: 0, phaseDeadlineMs: 5_000, assetDurationMs: 3_000, finished: false }];
    state.activeAudioOperationId = 'op'; state.pauseReasons = ['practice-coach'];
    expect(advanceClock(state, 4_999).pauseReasons).toEqual(['practice-coach', 'speech']);
    const done = advanceClock(state, 5_000);
    expect(done.activeAudioOperationId).toBeNull();
    expect(done.audioOperations[0]!.finished).toBe(true);
    expect(done.pauseReasons).toEqual(['practice-coach']);
  });
});
