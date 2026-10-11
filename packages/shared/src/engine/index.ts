import {
  AUDIO_PHASE_MAX_MS, CreateGameOptionsSchema, GameActionSchema, InternalStateSchema, PublicStateSchema, TurnEvaluationSchema,
  type CreateGameOptions, type EngineResult, type EvidenceRecord, type GameAction, type Guard, type InternalState, type NpcId, type PublicState, type TurnContext, type TurnEvaluation,
} from '../contracts.js';
import { authoredFacts, clarifyReplies, cues, groundedReplies, speakMandarinReplies, npcs, sceneManifest } from '../content/index.js';
import { missionFor } from '../content/missions.js';
import { advanceClock } from './clock.js';
import { selectPracticeTier, updateSkillsAfterAttempt } from './skills.js';
export { advanceClock } from './clock.js';
export { createFixtureDialogueProvider } from './fixture-dialogue.js';

export class SegmentNotImplementedError extends Error {
  readonly code = 'SEGMENT_NOT_IMPLEMENTED';
  constructor(readonly segment: string, readonly feature: string) { super(`${feature} is unimplemented; build ${segment}.`); }
}
export class EngineRuleError extends Error {
  readonly status = 422;
  readonly code = 'ACTION_FORBIDDEN';
}
const requireRule = (condition: unknown, message: string): void => { if (!condition) throw new EngineRuleError(message); };
const delivered = (state: InternalState, cueId: string): boolean => state.cuePlaybacks.some((record) => record.attemptId === state.attemptId && record.cueId === cueId && record.delivered);
const prefix = (state: InternalState) => state.missionId.toLowerCase();
const currentNode = (state: InternalState) => missionFor(state.missionId).nodes.find((node) => node.id === state.nodeId)!;
const mood = (patience: number): InternalState['npcState'][NpcId]['mood'] => patience >= 4 ? 'warm' : patience >= 2 ? 'neutral' : patience === 1 ? 'terse' : 'disengaged';

export function createGame(options: CreateGameOptions, nowMs: number): InternalState {
  const parsed = CreateGameOptionsSchema.parse(options);
  const mission = missionFor(parsed.missionId);
  const snapshot = parsed.missionId === 'P1' ? 'p1.cafe' : parsed.missionId === 'P2' ? 'p2.original' : 'b1.original';
  return InternalStateSchema.parse({
    sessionId: parsed.sessionId, attemptId: parsed.attemptId, missionId: parsed.missionId, validationMode: parsed.validationMode, inputPreference: parsed.inputPreference, providerStatus: parsed.providerStatus, version: 0, nodeId: mission.startNode, mode: mission.mode, status: 'active', zoneId: parsed.missionId === 'P1' ? 'plaza' : 'concourse',
    position: parsed.missionId === 'P1' ? sceneManifest.spawn : { x: 0, z: 0 }, lastMovementAtMs: nowMs, tier: mission.mode === 'boss' ? 1 : parsed.initialTier,
    flags: { 'p1.kiosk': false }, inventory: { hint: 0, freeze: 0 }, xp: 0, badges: [], awardedRewardIds: [], unlockedMissionIds: ['P1'], inspectedTargetIds: [], cuePlaybacks: [],
    npcState: Object.fromEntries(npcs.map((npc) => [npc.id, { patience: npc.initialPatience, mood: mood(npc.initialPatience), history: [], revealedFactIds: [], repeatCounts: {}, cooldownRemainingMs: 0 }])),
    evidence: [], skills: Object.fromEntries(['reading', 'listening', 'conversation', 'repair'].map((track) => [track, { mastery: 0.4, independentCount: 0 }])), difficulty: parsed.initialTier, skillUpdatedAttemptIds: [],
    timer: { initialMs: mission.activeTimerMs ?? 0, remainingMs: mission.activeTimerMs ?? 0, lastUpdatedAtMs: nowMs, pauseReasons: [], freezeRemainingMs: 0 },
    audioOperations: [], activeAudioOperationId: null, pendingTurn: null, factSnapshotId: snapshot, secretFacts: authoredFacts[snapshot],
  });
}

function guardPasses(state: InternalState, guard: Guard): boolean {
  switch (guard.op) {
    case 'flagEquals': return state.flags[guard.flag] === guard.value;
    case 'flagExists': return state.flags[guard.flag] !== undefined;
    case 'itemAtLeast': return state.inventory[guard.item] >= guard.quantity;
    case 'zoneIs': return state.zoneId === guard.zoneId;
    case 'cueDelivered': return delivered(state, guard.cueId);
    case 'timeRemainingAbove': return (state.timer?.remainingMs ?? Infinity) > guard.remainingMs;
  }
}
function evidence(state: InternalState, track: EvidenceRecord['track'], score: EvidenceRecord['score'], cueId?: EvidenceRecord['cueId'], assisted = false, decisionId = state.nodeId): void {
  const turnId = track === 'conversation' ? state.pendingTurn?.turnId : undefined;
  const previous = state.evidence.filter((entry) => entry.attemptId === state.attemptId && entry.track === track && entry.cueId === cueId && entry.turnId === turnId);
  if (previous.some((entry) => entry.listeningAssisted === assisted) || previous.length && !assisted) return;
  const decisionPrefix = `evidence.${track}.${decisionId}.`;
  const firstAttempt = previous.length === 0 && (track !== 'conversation' || !state.evidence.some((entry) => entry.attemptId === state.attemptId && entry.id.startsWith(decisionPrefix)));
  const id = `${decisionPrefix}${state.evidence.length + 1}`;
  const source = state.pendingTurn?.source;
  state.evidence.push({ id, attemptId: state.attemptId, missionId: state.missionId, track, score, cueId,
    ...(track === 'conversation' ? { turnId: state.pendingTurn?.turnId, conversationSource: source === 'stt' ? 'spoken' : source === 'stt-edited' ? 'edited' : 'typed' } : {}),
    independent: !assisted && !state.validationMode, firstAttempt, validationMode: state.validationMode, listeningAssisted: assisted, providerFailure: false });
}
function terminal(state: InternalState, result: 'clear' | 'fail', events: EngineResult['events']): void {
  if (state.status !== 'active') return;
  state.status = result === 'clear' ? 'cleared' : 'failed';
  const mission = missionFor(state.missionId);
  if (result === 'clear' && !state.awardedRewardIds.includes(mission.reward.id)) {
    state.awardedRewardIds.push(mission.reward.id);
    state.xp += mission.reward.xp;
    for (const item of ['hint', 'freeze'] as const) state.inventory[item] = Math.min(3, state.inventory[item] + mission.reward.items[item]);
    if (mission.reward.badge && !state.badges.includes(mission.reward.badge)) state.badges.push(mission.reward.badge);
    const next = state.missionId === 'P1' ? 'P2' : state.missionId === 'P2' ? 'B1' : null;
    if (next && !state.unlockedMissionIds.includes(next)) state.unlockedMissionIds.push(next);
    events.push({ id: `${state.attemptId}.reward`, kind: 'reward', message: state.validationMode ? 'Simulated validation reward.' : 'Mission reward earned.' });
  }
  Object.assign(state, updateSkillsAfterAttempt(state));
  state.timer!.pauseReasons = [];
  state.timer!.freezeRemainingMs = 0;
  events.push({ id: `${state.attemptId}.result`, kind: 'result', message: result === 'clear' ? 'Mission complete.' : 'Attempt ended. Retry for a fresh attempt.' });
}
export function synchronizeGame(state: InternalState, nowMs: number): EngineResult {
  const next = advanceClock(state, nowMs);
  const events: EngineResult['events'] = [];
  if (next.status === 'active' && next.timer!.initialMs > 0 && next.timer!.remainingMs === 0) {
    if (next.mode === 'boss') terminal(next, 'fail', events);
    else {
      next.nodeId = next.flags['p2.pa'] ? 'p2.route' : next.flags['p2.conversation'] ? 'p2.pa' : next.flags['p2.sign'] ? 'p2.conversation' : 'p2.board';
      next.timer!.remainingMs = next.timer!.initialMs;
      events.push({ id: `${next.attemptId}.practice-expiry-${nowMs}`, kind: 'objective', message: 'Practice timer ended. Try the boarding route again.' });
    }
  }
  return { state: next, events };
}
function transition(state: InternalState, trigger: GameAction | TurnEvaluation, events: EngineResult['events']): boolean {
  const isAction = 'type' in trigger;
  const candidates = isAction ? currentNode(state).actionTransitions : currentNode(state).intentTransitions;
  const selected = candidates.find((entry) => {
    if (!Object.entries(entry.requiredFlags).every(([key, value]) => state.flags[key] === value) || !entry.guards.every((guard) => guardPasses(state, guard))) return false;
    if ('type' in entry.trigger && isAction) return Object.entries(entry.trigger).every(([key, value]) => (trigger as unknown as Record<string, unknown>)[key] === value);
    if ('intent' in entry.trigger && !isAction) return entry.trigger.intent === trigger.intent && entry.trigger.slots.every((slot) => trigger.slots.some((value) => value.key === slot.key && value.value === slot.value));
    return false;
  });
  if (!selected) return false;
  if ((selected.nextNode && selected.nextNode !== state.nodeId || selected.result === 'clear') && !selected.setFlags['p2.wrong-platform']) state.flags[state.nodeId] = true;
  if (selected.setFlags['p2.wrong-platform']) { state.flags['p2.route'] = false; state.flags['p2.boarding'] = false; }
  Object.assign(state.flags, selected.setFlags);
  if (selected.nextNode) state.nodeId = selected.nextNode;
  if (selected.result !== 'none') terminal(state, selected.result, events);
  return true;
}
export function requireProximity(state: InternalState, id: string): void {
  const target = sceneManifest.interactables.find((entry) => entry.id === id);
  requireRule(target && (target.id.startsWith(`${prefix(state)}.`) || npcs.some((npc) => npc.id === id)), 'Unknown mission interactable.');
  requireRule(target?.zoneId === state.zoneId && (state.validationMode || Math.hypot(state.position.x - target.position.x, state.position.z - target.position.z) <= sceneManifest.interactionRadius), 'Move closer to the interactable.');
}
function cueDelivered(state: InternalState, cueId: string, events: EngineResult['events']): void {
  if (cueId === 'p2.platform-change' || cueId === 'b1.harbor-change') {
    state.factSnapshotId = cueId === 'p2.platform-change' ? 'p2.updated' : 'b1.updated';
    state.secretFacts = { ...authoredFacts[state.factSnapshotId as keyof typeof authoredFacts] };
  }
  const record = [...state.cuePlaybacks].reverse().find((entry) => entry.cueId === cueId && entry.delivered);
  if (record) transition(state, { type: 'playCue', cueId: record.cueId, channel: record.channel }, events);
}
function decisionEvidence(state: InternalState, correct: boolean): void {
  const cueId = state.missionId === 'P2' ? 'p2.platform-change' : 'b1.harbor-change';
  const record = [...state.cuePlaybacks].reverse().find((entry) => entry.cueId === cueId && entry.delivered);
  const assisted = !record || record.listeningAssisted || state.cuePlaybacks.some((entry) => entry.cueId === cueId && entry.listeningAssisted) || Boolean(state.flags['session.assisted']);
  evidence(state, 'listening', correct ? 1 : 0, cueId, assisted);
  if (correct && state.flags['p2.wrong-platform']) {
    // A repair made after subtitle-assisted PA is not independent: no mastery, no +20 milestone.
    evidence(state, 'repair', 0.5, 'p2.platform-change', assisted);
    const rewardId = 'p2.independent-repair';
    if (!state.validationMode && !assisted && !state.awardedRewardIds.includes(rewardId)) { state.xp += 20; state.awardedRewardIds.push(rewardId); }
  }
}

export function applyAction(state: InternalState, raw: GameAction, nowMs: number): EngineResult {
  const action = GameActionSchema.parse(raw);
  const result = synchronizeGame(state, nowMs);
  const next = result.state;
  const events = result.events;
  if (action.type === 'retryMission' || action.type === 'startMission') {
    const missionId = action.type === 'retryMission' ? next.missionId : action.missionId;
    requireRule(next.unlockedMissionIds.includes(missionId), 'Complete the prerequisite mission first.');
    const fresh = createGame({ sessionId: next.sessionId, attemptId: `${prefix(next)}.${nowMs}.${next.version + 1}`, missionId, initialTier: next.difficulty === 0 ? 0 : 1, validationMode: next.validationMode, inputPreference: next.inputPreference, providerStatus: next.providerStatus }, nowMs);
    for (const key of ['version', 'inventory', 'xp', 'badges', 'awardedRewardIds', 'unlockedMissionIds', 'skills', 'evidence', 'difficulty', 'skillUpdatedAttemptIds'] as const) Object.assign(fresh, { [key]: structuredClone(next[key]) });
    fresh.tier = selectPracticeTier(next, missionId);
    if (fresh.mode === 'practice') fresh.difficulty = fresh.tier;
    return { state: fresh, events };
  }
  if (action.type === 'setInputPreference') { next.inputPreference = action.preference; return result; }
  requireRule(next.status === 'active', 'The attempt has ended. Start or retry a mission.');
  switch (action.type) {
    case 'moveZone': {
      const zone = sceneManifest.zones.find((entry) => entry.id === action.zoneId)!;
      const position = action.position ?? zone.center;
      requireRule(next.validationMode || Boolean(action.position), 'World movement requires a position.');
      requireRule(position.x >= zone.bounds.minX && position.x <= zone.bounds.maxX && position.z >= zone.bounds.minZ && position.z <= zone.bounds.maxZ, 'Position is outside the requested zone.');
      // Timer synchronization also runs on reads and unrelated actions. Movement
      // needs its own baseline, advanced only when a position is accepted. Elapsed time is
      // measured between arrivals, so request latency jitter steals from the next interval:
      // the slack covers ~250 ms of it (one unit at the authored speed) while still rejecting
      // teleports. ponytail: slack is per request; use a token bucket if cheating ever matters.
      requireRule(next.validationMode || Math.hypot(position.x - state.position.x, position.z - state.position.z) <= sceneManifest.movementSpeed * Math.max(0, nowMs - (state.lastMovementAtMs ?? state.timer!.lastUpdatedAtMs)) / 1000 + 1, 'Movement exceeds the authored speed.');
      requireRule(!sceneManifest.colliders.some(({ bounds }) => position.x >= bounds.minX - sceneManifest.playerRadius && position.x <= bounds.maxX + sceneManifest.playerRadius && position.z >= bounds.minZ - sceneManifest.playerRadius && position.z <= bounds.maxZ + sceneManifest.playerRadius), 'Position intersects a wall.');
      next.zoneId = action.zoneId; next.position = position; next.lastMovementAtMs = nowMs;
      if (next.missionId === 'P1' && action.zoneId === 'concourse' && next.flags['p1.receipt'] && delivered(next, 'p1.station-directions')) {
        const playback = [...next.cuePlaybacks].reverse().find((entry) => entry.cueId === 'p1.station-directions' && entry.delivered);
        evidence(next, 'listening', 1, 'p1.station-directions', !playback || playback.listeningAssisted || next.cuePlaybacks.some((entry) => entry.cueId === 'p1.station-directions' && entry.listeningAssisted));
      }
      transition(next, action, events);
      break;
    }
    case 'inspect':
      requireProximity(next, action.targetId);
      if (!next.inspectedTargetIds.includes(action.targetId)) next.inspectedTargetIds.push(action.targetId);
      if (action.targetId === 'p1.entrance-sign') next.flags['p1.sign'] = true;
      if (action.targetId === 'b1.destination-board') next.flags['b1.sign'] = true;
      transition(next, action, events); break;
    case 'choose': {
      requireProximity(next, action.choiceId);
      const valid = currentNode(next).actionTransitions.some((entry) => entry.trigger.type === 'choose' && entry.trigger.choiceId === action.choiceId && Object.entries(entry.requiredFlags).every(([key, value]) => next.flags[key] === value) && entry.guards.every((guard) => guardPasses(next, guard)));
      requireRule(valid, 'This choice requires the preceding mission steps.');
      if (action.choiceId === 'p1.enter-plaza-door' || action.choiceId === 'p1.try-closed-door' && next.flags['p1.sign']) evidence(next, 'reading', action.choiceId === 'p1.enter-plaza-door' ? 1 : 0, 'p1.entrance-sign', Boolean(next.flags['session.assisted']));
      if (action.choiceId.includes('.board-')) decisionEvidence(next, action.choiceId === 'p2.board-3' || action.choiceId === 'b1.board-2');
      requireRule(transition(next, action, events), 'Choice is unavailable.');
      if (action.choiceId === 'p2.board-1' || action.choiceId === 'p2.board-2') events.push({ id: `${next.attemptId}.repair-${nowMs}`, kind: 'objective', message: groundedReplies.wrongPracticePlatform });
      break;
    }
    case 'playCue': {
      const cue = cues.find((entry) => entry.id === action.cueId && entry.missionId === next.missionId);
      requireRule(cue && cue.kind !== 'sign', 'This cue is not playable.');
      requireProximity(next, action.cueId);
      requireRule(action.channel !== 'validation-text' || next.validationMode, 'Developer transcripts require a validation session.');
      requireRule(action.cueId !== 'p1.station-directions' || next.flags['p1.price-confirmed'], 'Confirm the drink price before receiving directions.');
      requireRule(action.cueId !== 'p2.platform-change' || next.flags['p2.conversation'], 'Ask for the original directions before the update.');
      requireRule(action.cueId !== 'b1.harbor-change' || next.flags['b1.ticket'], 'Acquire the ticket before the announcement.');
      requireRule(!next.activeAudioOperationId && !next.cuePlaybacks.some((entry) => !entry.delivered && !entry.interrupted && entry.deadlineMs > nowMs), 'Another audio operation is active.');
      requireRule(next.cuePlaybacks.length < 100, 'Cue playback limit reached.');
      const immediate = action.channel !== 'audio';
      next.cuePlaybacks.push({ id: `${next.attemptId}.cue-${next.cuePlaybacks.length + 1}`, attemptId: next.attemptId, cueId: action.cueId, channel: action.channel, startedAtMs: nowMs, deadlineMs: nowMs + (immediate ? 0 : 10_000), delivered: immediate, interrupted: false, listeningAssisted: immediate || next.validationMode });
      if (immediate) cueDelivered(next, action.cueId, events);
      else next.timer!.pauseReasons.push('pa');
      break;
    }
    case 'finishCue': {
      const playback = next.cuePlaybacks.find((entry) => entry.id === action.playbackId && entry.attemptId === next.attemptId);
      requireRule(playback && !playback.interrupted, 'Unknown or expired playback.');
      if (!playback!.delivered) {
        requireRule(nowMs >= playback!.deadlineMs - 2_000, 'Playback has not completed.');
        playback!.delivered = true;
        next.timer!.pauseReasons = next.timer!.pauseReasons.filter((reason) => reason !== 'pa');
        cueDelivered(next, playback!.cueId, events);
      }
      break;
    }
    case 'audioPhase': {
      let operation = next.audioOperations.find((entry) => entry.id === action.operationId && entry.attemptId === next.attemptId);
      if (!operation) {
        requireRule(action.phase === 'recording' && !next.activeAudioOperationId, 'Unknown audio operation or overlapping recording.');
        requireRule(!next.cuePlaybacks.some((entry) => !entry.delivered && !entry.interrupted), 'PA playback is active.');
        requireRule(next.audioOperations.length < 100, 'Audio operation limit reached.');
        operation = { id: action.operationId, attemptId: next.attemptId, kind: 'recording', phase: 'recording', registeredAtMs: nowMs, phaseStartedAtMs: nowMs, phaseDeadlineMs: nowMs + AUDIO_PHASE_MAX_MS.recording, finished: false };
        next.audioOperations.push(operation); next.activeAudioOperationId = operation.id;
      } else {
        requireRule(!operation.finished, 'Audio operation has ended.');
        if (operation.phase === action.phase) break;
        const allowed = operation.kind === 'playback' ? action.phase === 'idle' : (operation.phase === 'recording' && action.phase === 'transcribing') || (operation.phase === 'transcribing' && action.phase === 'confirming') || action.phase === 'idle';
        requireRule(allowed, 'Invalid audio phase progression.');
        operation.phase = action.phase; operation.phaseStartedAtMs = nowMs; operation.phaseDeadlineMs = nowMs + AUDIO_PHASE_MAX_MS[action.phase];
      }
      if (action.phase === 'idle') { operation.finished = true; next.activeAudioOperationId = null; }
      next.timer!.pauseReasons = next.timer!.pauseReasons.filter((reason) => !['speech', 'transcription', 'confirmation'].includes(reason));
      if (action.phase === 'playing') next.timer!.pauseReasons.push('speech');
      if (action.phase === 'transcribing') next.timer!.pauseReasons.push('transcription');
      if (action.phase === 'confirming') next.timer!.pauseReasons.push('confirmation');
      break;
    }
    case 'useItem':
      requireRule(next.mode === 'practice' && next.inventory[action.item] > 0, 'This item is unavailable.');
      if (action.item === 'freeze') { requireRule(next.timer!.initialMs > 0 && next.timer!.freezeRemainingMs === 0, 'Freeze cannot stack or affect an untimed mission.'); next.timer!.freezeRemainingMs = 20_000; next.timer!.pauseReasons.push('freeze'); }
      else {
        next.flags['session.assisted'] = true;
        const level = Math.min(3, Number(next.flags[`${next.nodeId}-hint-level`] ?? 0) + 1);
        next.flags[`${next.nodeId}-hint-level`] = level;
        const hint = missionFor(next.missionId).hints.find((entry) => entry.nodeId === next.nodeId && entry.level === level)!;
        events.push({ id: `${next.attemptId}.hint-${level}`, kind: 'objective', message: hint.text });
      }
      next.inventory[action.item]--; break;
    case 'pausePractice':
      requireRule(next.mode === 'practice', 'Boss coaching pauses are forbidden.');
      if (!next.timer!.pauseReasons.includes('practice-coach')) next.timer!.pauseReasons.push('practice-coach');
      for (const npc of npcs) if (next.npcState[npc.id].patience === 0) { next.npcState[npc.id].patience = npc.initialPatience; next.npcState[npc.id].mood = mood(npc.initialPatience); next.npcState[npc.id].cooldownRemainingMs = 0; }
      break;
    case 'resumePractice': requireRule(next.mode === 'practice', 'Boss coaching pauses are forbidden.'); next.timer!.pauseReasons = next.timer!.pauseReasons.filter((reason) => reason !== 'practice-coach'); break;
  }
  return { state: InternalStateSchema.parse(next), events };
}

export function dialogueContext(state: InternalState, npcId: NpcId): TurnContext {
  requireRule(state.status === 'active', 'This attempt has ended.');
  requireProximity(state, npcId);
  requireRule(state.missionId === 'P1' ? npcId === 'xiaolin' : state.missionId === 'P2' ? npcId === 'achen' : npcId !== 'xiaolin', 'This NPC is not part of the current mission.');
  const npc = npcs.find((entry) => entry.id === npcId)!;
  const runtime = state.npcState[npcId];
  requireRule(runtime.patience > 0 || (state.mode === 'boss' && runtime.cooldownRemainingMs === 0), 'The NPC needs a short break.');
  return { missionId: state.missionId, mode: state.mode, tier: state.tier, npcId, persona: npc.persona, patience: runtime.patience, allowedIntents: [...npc.allowedIntents], facts: { ...state.secretFacts }, history: runtime.history };
}
/** English/other-only, hostile, or unclear mixed input: never acted on, never advances, costs patience. */
export function offTarget(evaluation: TurnEvaluation): boolean {
  return evaluation.targetLanguageUse === 'no' || evaluation.interaction === 'irrelevant' || evaluation.interaction === 'insult'
    || (evaluation.targetLanguageUse !== 'yes' && evaluation.intentGrade.score < 0.5);
}
/** Deterministic slot completion: a confirmation after the NPC stated the drink and price only needs what the facts already fix. */
function completeDrinkConfirmation(state: InternalState, evaluation: TurnEvaluation): TurnEvaluation {
  if (state.missionId !== 'P1' || evaluation.intent !== 'confirm_drink_price') return evaluation;
  // A bare agreement (no slots) or a bare price takes the drink the player already chose; a drink
  // named without a price stays unconfirmed, so a wrong or unparsed price never confirms by omission.
  if (evaluation.slots.some((entry) => entry.key === 'drink')) return evaluation;
  const chosen = state.flags['p1.drink'];
  if (chosen !== 'tea' && chosen !== 'water') return evaluation;
  const slots: TurnEvaluation['slots'] = [{ key: 'drink', value: chosen }, ...evaluation.slots];
  if (!slots.some((entry) => entry.key === 'priceCny')) slots.push({ key: 'priceCny', value: chosen === 'tea' ? 10 : 5 });
  return { ...evaluation, slots };
}
/** An NPC line that closes the exchange ("thanks, come again", "bye"): the conversation ends after it, whoever said goodbye first. */
const CLOSING_LINE = /再见|拜拜|慢走|欢迎(?:您)?(?:再来|下次|常来)|下次(?:再来|见)|回头见|一路(?:顺风|平安)|路上小心/;
export function isClosingLine(text: string | undefined): boolean { return Boolean(text && CLOSING_LINE.test(text)); }
export function groundedReply(state: InternalState, npcId: NpcId, evaluation: TurnEvaluation): string {
  const slot = (key: string) => evaluation.slots.find((entry) => entry.key === key)?.value;
  if (evaluation.interaction === 'insult') return '请礼貌一点。';
  const byNode = (table: Record<string, string>) => table[`${state.nodeId}.${String(state.flags['p1.drink'] ?? '')}`] ?? table[state.nodeId] ?? table.default!;
  if (offTarget(evaluation)) return state.mode === 'boss' ? groundedReplies.clarification : byNode(speakMandarinReplies);
  if (evaluation.intent === 'unknown') return state.mode === 'boss' ? groundedReplies.clarification : byNode(clarifyReplies);
  if (evaluation.intent === 'request_repeat') return [...state.npcState[npcId].history].reverse().find((entry) => entry.role === 'npc')?.text ?? groundedReplies.clarification;
  if (evaluation.intent === 'farewell') return npcId !== 'xiaolin' ? groundedReplies.farewell : state.flags['p1.receipt'] ? groundedReplies.farewellPaid : groundedReplies.farewellCafe;
  if (state.missionId === 'P1') {
    if (evaluation.intent === 'cancel_order') return '好的。请重新选择茶或水并确认价格，再去售货亭。';
    if (['order_drink', 'accept_substitute', 'confirm_drink_price'].includes(evaluation.intent)) {
      if (slot('drink') === 'coffee') return groundedReplies.coffeeUnavailable;
      if (evaluation.intent === 'confirm_drink_price' && state.flags['p1.price-confirmed']) return '好的，请付款。';
      return slot('drink') === 'tea' ? groundedReplies.teaPrice : slot('drink') === 'water' ? groundedReplies.waterPrice : groundedReplies.missingDrinkPrice;
    }
    if (evaluation.intent === 'ask_direction') return authoredFacts['p1.cafe'].stationDirections;
  }
  if (evaluation.intent === 'buy_ticket' || evaluation.intent === 'confirm_ticket') return state.flags['b1.ticket-ready'] ? groundedReplies.ticketPrice : groundedReplies.ticketDetails;
  if (evaluation.intent === 'ask_direction' || evaluation.intent === 'confirm_platform') {
    if (slot('destination') === 'airport') return state.missionId === 'B1' && state.factSnapshotId === 'b1.updated' ? '去机场的列车取消了。' : '去机场的车在二号站台。';
    if (state.missionId === 'B1' && slot('destination') === 'jiangbin') return '去江滨的车在三号站台。';
    if (state.missionId === 'P2') return slot('destination') === 'haigang' ? '请问去江滨的列车。' : state.factSnapshotId === 'p2.updated' ? groundedReplies.jiangbinUpdated : groundedReplies.jiangbinOriginal;
    return state.factSnapshotId === 'b1.updated' ? groundedReplies.haigangUpdated : '去海港的车在一号站台。';
  }
  // Boss text is confined to authored Mandarin so an injected model reply cannot leak coaching.
  return state.mode === 'boss' ? groundedReplies.clarification : evaluation.replyZh;
}
export function applyEvaluation(state: InternalState, npcId: NpcId, raw: TurnEvaluation, nowMs: number): EngineResult {
  const result = synchronizeGame(state, nowMs);
  const next = result.state;
  const evaluation = completeDrinkConfirmation(next, TurnEvaluationSchema.parse(raw));
  dialogueContext(next, npcId);
  requireRule(next.pendingTurn?.npcId === npcId && next.pendingTurn.attemptId === next.attemptId, 'Evaluation requires a current server-reserved turn.');
  const npc = next.npcState[npcId];
  if (npc.patience === 0) npc.patience = 1;
  const successful = evaluation.interaction === 'relevant' && evaluation.targetLanguageUse === 'yes' && evaluation.intentGrade.score >= 0.7 && evaluation.intentGrade.confidence >= 0.75;
  if (evaluation.intent === 'confirm_drink_price') next.flags['p1.price-confirmed'] = false;
  let transitioned = false;
  if (successful) {
    const before = next.nodeId;
    const options = currentNode(next).intentTransitions.filter((entry) => entry.trigger.intent === evaluation.intent);
    const relevantDecision = options.length > 0;
    const missingDetail = relevantDecision && options.some((entry) => entry.trigger.slots.some((required) => !evaluation.slots.some((slot) => slot.key === required.key)));
    transitioned = transition(next, evaluation, result.events);
    if (transitioned) {
      npc.patience = Math.min(5, npc.patience + 1);
      evidence(next, 'conversation', 1, undefined, next.pendingTurn!.assisted, before);
      if (next.flags[`${prefix(next)}.skill-ambiguous-${before.split('.')[1]}`]) evidence(next, 'repair', 0.5, undefined, next.pendingTurn!.assisted || Boolean(next.flags[`${prefix(next)}.skill-example-${before.split('.')[1]}`]));
      if (before === 'p2.conversation') evidence(next, 'reading', 1, 'p2.timetable', next.pendingTurn!.assisted);
      if (next.missionId === 'B1' && evaluation.intent === 'buy_ticket' && next.flags['b1.ticket-requested']) evidence(next, 'reading', 1, 'b1.destination-board', next.pendingTurn!.assisted);
    } else if (relevantDecision) {
      evidence(next, 'conversation', 0, undefined, next.pendingTurn!.assisted, before);
      if (missingDetail) next.flags[`${prefix(next)}.skill-ambiguous-${before.split('.')[1]}`] = true;
      if (evaluation.coach?.improvedExample) next.flags[`${prefix(next)}.skill-example-${before.split('.')[1]}`] = true;
      if (!missingDetail && before === 'p2.conversation') evidence(next, 'reading', 0, 'p2.timetable', next.pendingTurn!.assisted);
      if (!missingDetail && next.missionId === 'B1' && evaluation.intent === 'buy_ticket') evidence(next, 'reading', 0, 'b1.destination-board', next.pendingTurn!.assisted);
    }
  }
  // Saying goodbye at the counter pays: the same transition and guards as the pay choice, so an unconfirmed price stays unpaid.
  const conversationEnded = evaluation.intent === 'farewell' && successful ? true : undefined;
  if (conversationEnded && next.nodeId === 'p1.receipt') transition(next, { type: 'choose', choiceId: 'p1.pay-cafe' }, result.events);
  // A miss in practice surfaces the node's vocabulary once, recorded like a used hint (assisted) without spending one.
  if (!transitioned && next.mode === 'practice' && !['greeting', 'request_repeat', 'farewell'].includes(evaluation.intent) && Number(next.flags[`${next.nodeId}-hint-level`] ?? 0) < 2) {
    const hint = missionFor(next.missionId).hints.find((entry) => entry.nodeId === next.nodeId && entry.level === 2);
    if (hint) {
      next.flags[`${next.nodeId}-hint-level`] = 2; next.flags['session.assisted'] = true;
      result.events.push({ id: `${next.attemptId}.vocab-${next.nodeId}`, kind: 'objective', message: `Hint: ${hint.text}` });
    }
  }
  if (evaluation.intent === 'request_repeat') {
    const cueId = next.missionId === 'P1' ? 'p1.station-directions' : next.missionId === 'P2' ? 'p2.platform-change' : 'b1.harbor-change';
    const count = npc.repeatCounts[cueId] ?? 0; npc.repeatCounts[cueId] = count + 1;
    if (count > 0) npc.patience = Math.max(1, npc.patience - 1);
  } else if (offTarget(evaluation)) {
    npc.patience = Math.max(0, npc.patience - 1);
    if (next.mode === 'practice') {
      next.xp = Math.max(0, next.xp - 5);
      const name = npcs.find((entry) => entry.id === npcId)!.nameZh;
      result.events.push({ id: `${next.attemptId}.language-${next.pendingTurn!.turnId}`, kind: 'objective', message: evaluation.interaction === 'insult' ? `${name} is upset: -5 XP. Stay polite.` : evaluation.targetLanguageUse === 'no' ? `${name} didn't understand English: -5 XP. Try it in Mandarin.` : `${name} didn't follow that: -5 XP. Try a short Mandarin sentence.` });
    }
  }
  if (npc.patience === 0) npc.cooldownRemainingMs = 10_000;
  npc.mood = mood(npc.patience);
  const reply = groundedReply(next, npcId, evaluation);
  // The NPC closing the exchange ("谢谢，欢迎再来！") ends it too; a requested repeat of an earlier goodbye does not.
  const npcClosed = evaluation.intent !== 'request_repeat' && isClosingLine(reply);
  npc.history.push({ role: 'player', text: next.pendingTurn!.text }, { role: 'npc', text: reply });
  npc.history = npc.history.slice(-12);
  return { state: InternalStateSchema.parse(next), events: result.events, ...(conversationEnded || npcClosed ? { conversationEnded: true as const } : {}) };
}
export function projectPublicState(state: InternalState, nowMs: number): PublicState {
  const next = synchronizeGame(state, nowMs).state;
  const mission = missionFor(next.missionId);
  const available = sceneManifest.interactables.filter((entry) => entry.id.startsWith(`${prefix(next)}.`) || (next.missionId === 'P1' ? entry.id === 'xiaolin' : next.missionId === 'P2' ? entry.id === 'achen' : entry.id === 'achen' || entry.id === 'laozhou'));
  return PublicStateSchema.parse({
    sessionId: next.sessionId, version: next.version, missionId: next.missionId, mode: next.mode, status: next.status, zoneId: next.zoneId, tier: next.tier,
    objectives: mission.nodes.map((node) => ({ id: node.id, label: node.objective, complete: next.status === 'cleared' || Boolean(next.flags[node.id]) })),
    interactables: available.map(({ id, kind, label, position }) => ({ id, kind, label, position })),
    visibleCues: cues.filter((cue) => cue.missionId === next.missionId && (next.inspectedTargetIds.includes(cue.id) || next.cuePlaybacks.some((entry) => entry.cueId === cue.id))).map((cue) => ({ id: cue.id, label: cue.label, ...((cue.variants.find((entry) => entry.tier === next.tier)?.audioAssetId ?? cue.audioAssetId) ? { audioAssetId: cue.variants.find((entry) => entry.tier === next.tier)?.audioAssetId ?? cue.audioAssetId } : {}), ...(cue.kind === 'sign' || next.cuePlaybacks.some((entry) => entry.cueId === cue.id && entry.channel !== 'audio') ? { text: cue.variants.find((entry) => entry.tier === next.tier)?.textZh ?? cue.textZh } : {}) })),
    npcMood: Object.fromEntries(npcs.map((npc) => [npc.id, next.npcState[npc.id].mood])), inventory: next.inventory, xp: next.xp, badges: next.badges,
    timer: next.timer!.initialMs === 0 ? null : { remainingMs: next.timer!.remainingMs, running: next.status === 'active' && next.timer!.pauseReasons.length === 0, syncedAtMs: nowMs },
    capabilities: { coach: next.mode === 'practice', hints: next.mode === 'practice', freeze: next.mode === 'practice' }, validationMode: next.validationMode, inputPreference: next.inputPreference, providerStatus: next.providerStatus,
    ...(next.debrief ? { debrief: next.debrief } : {}),
  });
}
