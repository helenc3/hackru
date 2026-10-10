import type { InternalState } from '../contracts.js';

type PauseReason = NonNullable<InternalState['timer']>['pauseReasons'][number];

/** Advance by wall time, splitting at each bounded pause/freeze deadline. */
export function advanceClock(state: InternalState, nowMs: number): InternalState {
  const next = structuredClone(state);
  const timer = next.timer;
  if (!timer) return next;
  if (!Number.isSafeInteger(nowMs) || nowMs < timer.lastUpdatedAtMs) throw new Error('Clock must be monotonic.');
  const startMs = timer.lastUpdatedAtMs;
  const operation = next.audioOperations.find((entry) => entry.id === next.activeAudioOperationId && entry.attemptId === next.attemptId && !entry.finished);
  const pauses: { reason: PauseReason; deadline: number }[] = [];
  if (timer.pauseReasons.includes('practice-coach') && next.mode === 'practice') pauses.push({ reason: 'practice-coach', deadline: Infinity });
  if (timer.pauseReasons.includes('provider') && next.pendingTurn?.attemptId === next.attemptId) pauses.push({ reason: 'provider', deadline: next.pendingTurn.createdAtMs + 8_000 });
  if (operation) {
    const reason = operation.phase === 'playing' ? 'speech' : operation.phase === 'transcribing' ? 'transcription' : operation.phase === 'confirming' ? 'confirmation' : undefined;
    if (reason) pauses.push({ reason, deadline: operation.phaseDeadlineMs });
  }
  for (const playback of next.cuePlaybacks) {
    if (!playback.delivered && !playback.interrupted && playback.channel === 'audio' && playback.attemptId === next.attemptId) {
      pauses.push({ reason: 'pa', deadline: playback.deadlineMs });
    }
  }
  const boundedEnd = Math.max(startMs, ...pauses.map((pause) => pause.deadline));
  const decisionMs = Math.max(0, nowMs - boundedEnd);
  const frozenMs = next.mode === 'practice' ? Math.min(timer.freezeRemainingMs, decisionMs) : 0;
  timer.freezeRemainingMs = next.mode === 'practice' ? timer.freezeRemainingMs - frozenMs : 0;
  const activeMs = decisionMs - frozenMs;
  if (next.status === 'active') timer.remainingMs = Math.max(0, timer.remainingMs - activeMs);
  // Cooldown costs active decision time; a freeze cannot bypass it.
  for (const npc of Object.values(next.npcState)) npc.cooldownRemainingMs = Math.max(0, npc.cooldownRemainingMs - decisionMs);
  timer.lastUpdatedAtMs = nowMs;
  timer.pauseReasons = [...new Set(pauses.filter((pause) => pause.deadline > nowMs).map((pause) => pause.reason))];
  if (timer.freezeRemainingMs > 0 && next.mode === 'practice') timer.pauseReasons.push('freeze');
  if (operation && operation.phaseDeadlineMs <= nowMs) {
    operation.finished = true;
    next.activeAudioOperationId = null;
  }
  for (const playback of next.cuePlaybacks) {
    if (!playback.delivered && !playback.interrupted && playback.deadlineMs <= nowMs) playback.interrupted = true;
  }
  return next;
}
