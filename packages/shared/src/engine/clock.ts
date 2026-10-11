import type { InternalState } from '../contracts.js';

type PauseReason = InternalState['pauseReasons'][number];

/** Quests are untimed: the clock only expires bounded audio/provider phases and recomputes pause reasons. */
export function advanceClock(state: InternalState, nowMs: number): InternalState {
  const next = structuredClone(state);
  const operation = next.audioOperations.find((entry) => entry.id === next.activeAudioOperationId && entry.attemptId === next.attemptId && !entry.finished);
  const reasons: PauseReason[] = next.pauseReasons.includes('practice-coach') ? ['practice-coach'] : [];
  if (next.pendingTurn?.attemptId === next.attemptId && next.pendingTurn.createdAtMs + 8_000 > nowMs) reasons.push('provider');
  if (operation && operation.phaseDeadlineMs > nowMs) {
    const reason = operation.phase === 'playing' ? 'speech' : operation.phase === 'transcribing' ? 'transcription' : operation.phase === 'confirming' ? 'confirmation' : undefined;
    if (reason) reasons.push(reason);
  }
  next.pauseReasons = reasons;
  if (operation && operation.phaseDeadlineMs <= nowMs) {
    operation.finished = true;
    next.activeAudioOperationId = null;
  }
  return next;
}
