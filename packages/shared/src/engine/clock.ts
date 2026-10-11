import type { InternalState } from '../contracts.js';

export const PROVIDER_PAUSE_MS = 20_000;

type PauseReason = InternalState['pauseReasons'][number];

/** Quests are untimed: the clock only expires bounded audio/provider phases and recomputes pause reasons. */
export function advanceClock(state: InternalState, nowMs: number): InternalState {
  const next = structuredClone(state);
  const operation = next.audioOperations.find((entry) => entry.id === next.activeAudioOperationId && entry.attemptId === next.attemptId && !entry.finished);
  const reasons: PauseReason[] = next.pauseReasons.includes('practice-coach') ? ['practice-coach'] : [];
  // A live turn can take the 8 s evaluation budget plus an 8 s wait for the spoken reply; 20 s covers that with margin.
  if (next.pendingTurn?.attemptId === next.attemptId && next.pendingTurn.createdAtMs + PROVIDER_PAUSE_MS > nowMs) reasons.push('provider');
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
