import {
  AUDIO_PHASE_MAX_MS, CreateGameOptionsSchema, GameActionSchema, InternalStateSchema, PHOTO_RULES, PublicStateSchema, QuestCategorySchema, TurnEvaluationSchema, WORLD_RULES,
  type CreateGameOptions, type EngineResult, type EvidenceRecord, type ExplorationState, type GameAction, type InternalState, type NpcAction, type NpcId, type Position, type PublicInteractable, type PublicState, type QuestCategory, type TurnContext, type TurnEvaluation,
} from '../contracts.js';
import { authoredFacts, clarifyReplies, DRINK_PRICES, groundedReplies, impatienceReplies, npcOpeners, npcs, pacingReplies, speakMandarinReplies, STARTING_CNY } from '../content/index.js';
import { missionFor, missionSnapshot, NEXT_MISSION } from '../content/missions.js';
import { BIAS_RULES, chunkKey, chunkOf, type Anchor, type Capability, type WorldView } from '../city/contracts.js';
import { recordEncounters } from '../city/bias.js';
import { questTarget } from '../city/quest-target.js';
import { text } from '../city/text-catalog.js';
import { npcIdentity } from '../city/npc-identity.js';
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
  constructor(message: string, readonly code: string = 'ACTION_FORBIDDEN') { super(message); }
}
type WorldAnchor = Anchor & { position: Position; chunk: string };
const requireRule = (condition: unknown, message: string): void => { if (!condition) throw new EngineRuleError(message); };
const prefix = (state: InternalState) => state.missionId.toLowerCase();
const currentNode = (state: InternalState) => missionFor(state.missionId).nodes.find((node) => node.id === state.nodeId)!;
/** Exchanges a quest NPC tolerates before losing patience; reaching it fails the attempt. */
export const NPC_PATIENCE_LIMIT = 12;
/** The NPC only delivers the goal (price, route, photo) from this exchange on; earlier goal requests are deferred in character. */
export const GOAL_WARMUP_EXCHANGES = 5;
const MOOD_RANK = { disengaged: 0, terse: 1, neutral: 2, warm: 3 } as const;
const mood = (patience: number): InternalState['npcState'][NpcId]['mood'] => patience >= 4 ? 'warm' : patience >= 2 ? 'neutral' : patience === 1 ? 'terse' : 'disengaged';
const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);
const QUEST_CAPABILITIES: Partial<Record<Capability, QuestCategory>> = { 'drink-vendor': 'drink-vendor', 'direction-helper': 'direction-helper', 'hotel-landmark': 'hotel-landmark', 'river-viewpoint': 'river-viewpoint', 'photo-passerby': 'photo-passerby' };
/** How far from a passerby the river viewpoint may be for the photo request to be eligible. */
const PHOTO_VIEWPOINT_RADIUS = 12;
const INTERACTABLE_RADIUS = 60;

function label(anchor: Anchor): string {
  const row = anchor.nameKey ? text(anchor.kind === 'npc' ? 'npc-name' : 'landmark', anchor.nameKey) : undefined;
  return row?.zh ?? (anchor.role ? npcs.find((npc) => npc.id === anchor.role)!.nameZh : anchor.capability === 'hotel-landmark' ? '上海大酒店' : anchor.capability === 'river-viewpoint' ? '黄浦江观景台' : '地标');
}
function requireAnchor(state: InternalState, world: WorldView, anchorId: string, radius: number = WORLD_RULES.interactionRadius): WorldAnchor {
  const anchor = world.anchor(anchorId);
  requireRule(anchor, 'Unknown world anchor.');
  requireRule(state.validationMode || distance(state.position, anchor!.position) <= radius, 'Move closer to the interactable.');
  return anchor!;
}

export function createGame(options: CreateGameOptions, nowMs: number): InternalState {
  const parsed = CreateGameOptionsSchema.parse(options);
  const mission = missionFor(parsed.missionId);
  const snapshot = missionSnapshot[parsed.missionId];
  const exploration: ExplorationState = { activeMs: 0, lastActiveAtMs: nowMs, visitedChunkKeys: [chunkKey(chunkOf(parsed.spawn))], lastEncounter: Object.fromEntries(QuestCategorySchema.options.map((category) => [category, { activeMs: 0, visitedChunks: 0 }])) as ExplorationState['lastEncounter'] };
  return InternalStateSchema.parse({
    sessionId: parsed.sessionId, worldId: parsed.worldId, attemptId: parsed.attemptId, missionId: parsed.missionId, validationMode: parsed.validationMode, inputPreference: parsed.inputPreference, providerStatus: parsed.providerStatus,
    version: 0, nodeId: mission.startNode, mode: 'practice', status: 'active', zoneId: 'shopping', position: parsed.spawn, lastMovementAtMs: nowMs, tier: parsed.initialTier,
    flags: {}, inventory: { hint: 0, cny: STARTING_CNY, drinks: [] }, purchases: [], xp: 0, badges: [], awardedRewardIds: [], unlockedMissionIds: ['Q1'], completedMissionIds: [],
    npcState: Object.fromEntries(npcs.map((npc) => [npc.id, { patience: npc.initialPatience, mood: mood(npc.initialPatience), history: [], anchorId: null, repeatCount: 0, cooldownRemainingMs: 0 }])),
    directions: null, photo: null, exploration,
    evidence: [], skills: Object.fromEntries(['reading', 'listening', 'conversation', 'repair'].map((track) => [track, { mastery: 0.4, independentCount: 0 }])), difficulty: parsed.initialTier, skillUpdatedAttemptIds: [],
    pauseReasons: [], audioOperations: [], activeAudioOperationId: null, pendingTurn: null, factSnapshotId: snapshot, secretFacts: { ...authoredFacts[snapshot] },
  });
}

function evidence(state: InternalState, track: EvidenceRecord['track'], score: EvidenceRecord['score'], cueId?: EvidenceRecord['cueId'], assisted = false, decisionId = state.nodeId): void {
  const turnId = track === 'conversation' ? state.pendingTurn?.turnId : undefined;
  const previous = state.evidence.filter((entry) => entry.attemptId === state.attemptId && entry.track === track && entry.cueId === cueId && entry.turnId === turnId);
  if (previous.some((entry) => entry.listeningAssisted === assisted) || previous.length && !assisted) return;
  if (state.evidence.length >= 500) return;
  const decisionPrefix = `evidence.${track}.${decisionId}.`;
  const firstAttempt = previous.length === 0 && (track !== 'conversation' || !state.evidence.some((entry) => entry.attemptId === state.attemptId && entry.id.startsWith(decisionPrefix)));
  const source = state.pendingTurn?.source;
  state.evidence.push({ id: `${decisionPrefix}${state.evidence.length + 1}`, attemptId: state.attemptId, missionId: state.missionId, track, score, cueId,
    ...(track === 'conversation' ? { turnId: state.pendingTurn?.turnId, conversationSource: source === 'stt' ? 'spoken' : source === 'stt-edited' ? 'edited' : 'typed' } : {}),
    independent: !assisted && !state.validationMode, firstAttempt, validationMode: state.validationMode, listeningAssisted: assisted, providerFailure: false });
}
function terminal(state: InternalState, result: 'clear' | 'fail', events: EngineResult['events'], failMessage = 'Attempt ended. Retry for a fresh attempt.'): void {
  if (state.status !== 'active') return;
  state.status = result === 'clear' ? 'cleared' : 'failed';
  const mission = missionFor(state.missionId);
  if (result === 'clear') {
    if (!state.completedMissionIds.includes(state.missionId)) state.completedMissionIds.push(state.missionId);
    const next = NEXT_MISSION[state.missionId];
    if (next && !state.unlockedMissionIds.includes(next)) state.unlockedMissionIds.push(next);
    // Grant each authored reward at most once.
    if (!state.awardedRewardIds.includes(mission.reward.id)) {
      state.awardedRewardIds.push(mission.reward.id);
      state.xp += mission.reward.xp;
      state.inventory.hint = Math.min(3, state.inventory.hint + mission.reward.items.hint);
      if (mission.reward.badge && !state.badges.includes(mission.reward.badge)) state.badges.push(mission.reward.badge);
      events.push({ id: `${state.attemptId}.reward`, kind: 'reward', message: state.validationMode ? 'Simulated validation reward.' : 'Quest reward earned.' });
    }
  }
  // Copy only the skill fields: callers hold references into state (e.g. npcState) that must stay live.
  const updated = updateSkillsAfterAttempt(state);
  state.skills = updated.skills; state.skillUpdatedAttemptIds = updated.skillUpdatedAttemptIds;
  if (updated.debrief) state.debrief = updated.debrief;
  state.pauseReasons = [];
  events.push({ id: `${state.attemptId}.result`, kind: 'result', message: result === 'clear' ? 'Quest complete.' : failMessage });
}
export function synchronizeGame(state: InternalState, nowMs: number): EngineResult {
  return { state: advanceClock(state, nowMs), events: [] };
}
function transition(state: InternalState, trigger: GameAction | TurnEvaluation, events: EngineResult['events']): boolean {
  const isAction = 'type' in trigger;
  const node = currentNode(state);
  const selected = (isAction ? node.actionTransitions : node.intentTransitions).find((entry) => {
    if (!Object.entries(entry.requiredFlags).every(([key, value]) => state.flags[key] === value)) return false;
    if ('type' in entry.trigger && isAction) return Object.entries(entry.trigger).every(([key, value]) => value === undefined || (trigger as unknown as Record<string, unknown>)[key] === value);
    if ('intent' in entry.trigger && !isAction) return entry.trigger.intent === trigger.intent && entry.trigger.slots.every((slot) => trigger.slots.some((value) => value.key === slot.key && value.value === slot.value));
    return false;
  });
  if (!selected) return false;
  if (selected.nextNode && selected.nextNode !== state.nodeId || selected.result === 'clear') state.flags[state.nodeId] = true;
  Object.assign(state.flags, selected.setFlags);
  if (selected.nextNode) state.nodeId = selected.nextNode;
  if (selected.result !== 'none') terminal(state, selected.result, events);
  return true;
}

function explore(state: InternalState, world: WorldView, nowMs: number): void {
  const exploration = state.exploration;
  // Active exploration time: gaps longer than 5 s between moves count as idle.
  exploration.activeMs = Math.min(1_000_000, exploration.activeMs + Math.max(0, Math.min(nowMs - exploration.lastActiveAtMs, 5_000)));
  exploration.lastActiveAtMs = nowMs;
  const key = chunkKey(chunkOf(state.position));
  // ponytail: the visited list stops growing at the schema cap, so chunk-based absence then relies on time alone.
  if (!exploration.visitedChunkKeys.includes(key) && exploration.visitedChunkKeys.length < 2_000) exploration.visitedChunkKeys.push(key);
  const categories = [...new Set(world.anchorsNear(state.position, BIAS_RULES.encounterRadius).flatMap((anchor) => QUEST_CAPABILITIES[anchor.capability] ?? []))];
  state.exploration = recordEncounters(exploration, categories);
}

/** The available drink the vendor has priced for this attempt, or null. */
function orderedDrink(state: InternalState): 'tea' | 'water' | null {
  const drink = state.flags['q1.drink'];
  return state.missionId === 'Q1' && state.status === 'active' && state.nodeId === 'q1.buy' && (drink === 'tea' || drink === 'water') && state.npcState.vendor.anchorId ? drink : null;
}
/** Why the vendor cannot be paid now, or null. */
function paymentProblem(state: InternalState, anchor: WorldAnchor): string | null {
  const drink = orderedDrink(state);
  if (!drink) return 'Ask the vendor for tea or water first.';
  if (anchor.capability !== 'drink-vendor' || anchor.id !== state.npcState.vendor.anchorId) return 'Pay the vendor who took your order.';
  if (state.inventory.cny < DRINK_PRICES[drink]) return `Not enough money: ¥${DRINK_PRICES[drink]} needed, ¥${state.inventory.cny} left.`;
  if (state.inventory.drinks.length >= 20 || state.purchases.length >= 50) return 'You cannot carry more drinks.';
  return null;
}
function pay(state: InternalState, anchor: WorldAnchor, nowMs: number, events: EngineResult['events']): void {
  const drink = state.flags['q1.drink'] as 'tea' | 'water';
  const price = DRINK_PRICES[drink];
  state.inventory.cny -= price;
  state.inventory.drinks.push(drink);
  state.purchases.push({ id: `${state.attemptId}.purchase-${state.purchases.length + 1}`, attemptId: state.attemptId, anchorId: anchor.id, drink, priceCny: price, atMs: nowMs });
  state.flags['q1.paid'] = true;
  events.push({ id: `${state.attemptId}.purchase-${state.purchases.length}`, kind: 'objective', message: `Paid ¥${price} for ${drink}.` });
}

export function applyAction(state: InternalState, raw: GameAction, nowMs: number, world: WorldView, movementMultiplier: 1 | 4 | 8 = 1): EngineResult {
  const action = GameActionSchema.parse(raw);
  nowMs = Math.floor(nowMs); // timestamps are integer ms
  const result = synchronizeGame(state, nowMs);
  const next = result.state;
  const events = result.events;
  if (action.type === 'startMission') {
    const missionId = action.missionId;
    // No restarting active or completed quests; a failed attempt (the NPC lost patience) may start again.
    const retryAfterFailure = next.status === 'failed' && next.missionId === missionId;
    requireRule(retryAfterFailure || (next.status === 'cleared' && NEXT_MISSION[next.missionId] === missionId), 'Only the next quest, or a failed quest, can be started.');
    requireRule(next.unlockedMissionIds.includes(missionId), 'Complete the prerequisite quest first.');
    const fresh = createGame({ sessionId: next.sessionId, worldId: next.worldId, attemptId: `${missionId.toLowerCase()}.${nowMs}.${next.version + 1}`, missionId, initialTier: next.difficulty === 0 ? 0 : 1, validationMode: next.validationMode, inputPreference: next.inputPreference, providerStatus: next.providerStatus, spawn: next.position }, nowMs);
    for (const key of ['version', 'zoneId', 'lastMovementAtMs', 'inventory', 'purchases', 'xp', 'badges', 'awardedRewardIds', 'unlockedMissionIds', 'completedMissionIds', 'directions', 'exploration', 'skills', 'evidence', 'difficulty', 'skillUpdatedAttemptIds'] as const) Object.assign(fresh, { [key]: structuredClone(next[key]) });
    fresh.tier = selectPracticeTier(next, missionId);
    fresh.difficulty = fresh.tier;
    return { state: fresh, events };
  }
  if (action.type === 'setInputPreference') { next.inputPreference = action.preference; return result; }
  requireRule(next.status === 'active', 'The attempt has ended.');
  switch (action.type) {
    case 'move': {
      const position = action.position;
      requireRule(world.walkable(position), 'That position is not walkable or not yet loaded.');
      // Elapsed time is measured between accepted arrivals; the slack absorbs ~250 ms of request jitter while still rejecting teleports.
      // ponytail: slack is per request; use a token bucket if cheating ever matters.
      requireRule(next.validationMode || distance(position, state.position) <= WORLD_RULES.movementSpeed * movementMultiplier * Math.max(0, nowMs - (state.lastMovementAtMs ?? nowMs)) / 1000 + 1, 'Movement exceeds the authored speed.');
      next.position = position; next.zoneId = world.districtAt(position); next.lastMovementAtMs = nowMs;
      explore(next, world, nowMs);
      break;
    }
    case 'choose': {
      requireRule(missionFor(next.missionId).allowedActionIds.includes(action.choiceId), 'This choice is not part of the current quest.');
      if (action.choiceId === 'q1.pay') {
        // The projected pay choice uses `<vendorAnchorId>.pay`; either form names the vendor.
        const anchor = requireAnchor(next, world, action.anchorId.replace(/\.pay$/, ''));
        const problem = paymentProblem(next, anchor);
        requireRule(!problem, problem ?? '');
        pay(next, anchor, nowMs, events);
      } else {
        const photo = next.photo;
        requireRule(photo && action.anchorId === photo.viewpointAnchorId, 'Ask a passerby for a photo first.');
        requireRule(photo!.status === 'accepted' || (photo!.status === 'countdown' && nowMs > photo!.countdownEndsAtMs! + PHOTO_RULES.captureWindowMs), 'The countdown is already running.');
        requireRule(next.validationMode || distance(next.position, photo!.spot) <= PHOTO_RULES.spotRadius, 'Stand on the photo spot.');
        photo!.status = 'countdown'; photo!.countdownEndsAtMs = nowMs + PHOTO_RULES.countdownMs;
        events.push({ id: `${next.attemptId}.photo-countdown-${photo!.attempts}`, kind: 'photo', message: '三、二、一……' });
      }
      requireRule(transition(next, action, events), 'Choice is unavailable.');
      break;
    }
    case 'photoCapture': {
      const photo = next.photo;
      requireRule(next.missionId === 'Q3' && photo && photo.id === action.photoRequestId && photo.status === 'countdown', 'No photo countdown is running for this request.');
      if (action.outcome === 'failed') {
        photo!.status = 'accepted'; photo!.attempts = Math.min(20, photo!.attempts + 1); delete photo!.countdownEndsAtMs;
        events.push({ id: `${next.attemptId}.photo-failed-${photo!.attempts}`, kind: 'photo', message: 'The photo did not work. Stand on the spot and try again.' });
      } else {
        requireRule(action.imageDigest, 'A captured photo needs its image digest.');
        requireRule(nowMs >= photo!.countdownEndsAtMs!, 'The countdown has not finished.');
        requireRule(nowMs <= photo!.countdownEndsAtMs! + PHOTO_RULES.captureWindowMs, 'The photo window expired; start the countdown again.');
        requireRule(next.validationMode || distance(next.position, photo!.spot) <= PHOTO_RULES.spotRadius, 'You left the photo spot.');
        photo!.status = 'captured';
        next.flags['q3.capture-verified'] = true;
        events.push({ id: `${next.attemptId}.photo-captured`, kind: 'photo', message: 'Photo taken by the Huangpu River!' });
      }
      requireRule(transition(next, action, events), 'Photo step is unavailable.');
      break;
    }
    case 'audioPhase': {
      let operation = next.audioOperations.find((entry) => entry.id === action.operationId && entry.attemptId === next.attemptId);
      if (!operation) {
        requireRule(action.phase === 'recording' && !next.activeAudioOperationId, 'Unknown audio operation or overlapping recording.');
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
      next.pauseReasons = next.pauseReasons.filter((reason) => !['speech', 'transcription', 'confirmation'].includes(reason));
      if (action.phase === 'playing') next.pauseReasons.push('speech');
      if (action.phase === 'transcribing') next.pauseReasons.push('transcription');
      if (action.phase === 'confirming') next.pauseReasons.push('confirmation');
      break;
    }
    case 'useItem': {
      requireRule(next.inventory.hint > 0, 'This item is unavailable.');
      next.flags['session.assisted'] = true;
      const level = Math.min(3, Number(next.flags[`${next.nodeId}-hint-level`] ?? 0) + 1);
      next.flags[`${next.nodeId}-hint-level`] = level;
      const hint = missionFor(next.missionId).hints.find((entry) => entry.nodeId === next.nodeId && entry.level === level)!;
      events.push({ id: `${next.attemptId}.hint-${level}`, kind: 'objective', message: hint.text });
      next.inventory.hint--; break;
    }
    case 'pausePractice':
      if (!next.pauseReasons.includes('practice-coach')) next.pauseReasons.push('practice-coach');
      for (const npc of npcs) if (next.npcState[npc.id].patience === 0) { next.npcState[npc.id].patience = npc.initialPatience; next.npcState[npc.id].mood = mood(npc.initialPatience); }
      break;
    case 'resumePractice': next.pauseReasons = next.pauseReasons.filter((reason) => reason !== 'practice-coach'); break;
  }
  return { state: InternalStateSchema.parse(next), events };
}

export function dialogueContext(state: InternalState, npcId: NpcId, anchorId: string, world: WorldView): TurnContext {
  requireRule(state.status === 'active', 'This attempt has ended.');
  requireRule(missionFor(state.missionId).npcRoles.includes(npcId), 'This NPC is not part of the current quest.');
  if (pendingGoalAction(npcActions(state), state.inventory.cny, npcId)) throw new EngineRuleError('The conversation is over: use the button to finish.', 'GOAL_ACTION_PENDING');
  const anchor = requireAnchor(state, world, anchorId);
  requireRule(anchor.kind === 'npc' && anchor.role === npcId, 'That anchor is not this NPC.');
  const npc = npcs.find((entry) => entry.id === npcId)!;
  const runtime = state.npcState[npcId];
  requireRule(runtime.patience > 0, 'The NPC needs a short break.');
  const identity = npcIdentity(anchor.nameKey);
  return { missionId: state.missionId, mode: state.mode, tier: state.tier, npcId, anchorId, nameZh: label(anchor), persona: identity ? `${npc.persona} Character gender: ${identity.gender}.` : npc.persona, patience: runtime.patience, allowedIntents: [...npc.allowedIntents], facts: { ...state.secretFacts }, history: runtime.history };
}
/** English/other-only, hostile, or unclear mixed input: never acted on, never advances, costs patience. */
export function offTarget(evaluation: TurnEvaluation): boolean {
  return evaluation.targetLanguageUse === 'no' || evaluation.interaction === 'irrelevant' || evaluation.interaction === 'insult'
    || (evaluation.targetLanguageUse !== 'yes' && evaluation.intentGrade.score < 0.5);
}
/** A confirmation after the NPC stated the drink and price only needs what the facts already fix. */
function completeDrinkConfirmation(state: InternalState, evaluation: TurnEvaluation): TurnEvaluation {
  if (state.missionId !== 'Q1' || evaluation.intent !== 'confirm_drink_price') return evaluation;
  // A bare agreement or bare price takes the chosen drink; a drink named without a price stays unconfirmed.
  if (evaluation.slots.some((entry) => entry.key === 'drink')) return evaluation;
  const chosen = state.flags['q1.drink'];
  if (chosen !== 'tea' && chosen !== 'water') return evaluation;
  const slots: TurnEvaluation['slots'] = [{ key: 'drink', value: chosen }, ...evaluation.slots];
  if (!slots.some((entry) => entry.key === 'priceCny')) slots.push({ key: 'priceCny', value: DRINK_PRICES[chosen] });
  return { ...evaluation, slots };
}
/** An NPC line that closes the exchange ("thanks, come again", "bye"): the conversation ends after it, whoever said goodbye first. */
const CLOSING_LINE = /再见|拜拜|慢走|欢迎(?:您)?(?:再来|下次|常来)|下次(?:再来|见)|回头见|一路(?:顺风|平安)|路上小心/;
export function isClosingLine(text: string | undefined): boolean { return Boolean(text && CLOSING_LINE.test(text)); }
/** Authored Mandarin for every fact-bearing reply. The model's replyZh is used only for small talk (bounded by the smallTalk/otherWares facts). */
export function groundedReply(state: InternalState, npcId: NpcId, evaluation: TurnEvaluation, _world?: WorldView): string {
  const slot = (key: string) => evaluation.slots.find((entry) => entry.key === key)?.value;
  const anchorId = state.npcState[npcId].anchorId;
  if (evaluation.interaction === 'insult') return '请礼貌一点。';
  const byNode = (table: Record<string, string>) => table[`${state.nodeId}.${String(state.flags['q1.drink'] ?? '')}`] ?? table[state.nodeId] ?? table.default!;
  if (offTarget(evaluation)) return byNode(speakMandarinReplies);
  if (evaluation.intent === 'unknown') return byNode(clarifyReplies);
  if (evaluation.intent === 'request_repeat') return [...state.npcState[npcId].history].reverse().find((entry) => entry.role === 'npc')?.text ?? groundedReplies.clarification;
  if (evaluation.intent === 'farewell') return npcId === 'vendor' && state.purchases.some((entry) => entry.attemptId === state.attemptId) ? groundedReplies.farewellPaid : groundedReplies.farewell;
  if (evaluation.intent === 'greeting') return npcOpeners[npcId];
  if (npcId === 'vendor') {
    if (evaluation.intent === 'cancel_order') return groundedReplies.cancelOrder;
    if (['order_drink', 'accept_substitute', 'confirm_drink_price'].includes(evaluation.intent)) {
      if (slot('drink') === 'coffee') return groundedReplies.coffeeUnavailable;
      if (evaluation.intent === 'confirm_drink_price' && orderedDrink(state)) return groundedReplies.priceConfirmed;
      return slot('drink') === 'tea' ? groundedReplies.teaPrice : slot('drink') === 'water' ? groundedReplies.waterPrice : groundedReplies.missingDrinkPrice;
    }
  }
  if (evaluation.intent === 'ask_directions') {
    if (slot('destination') !== 'grand-hotel') return groundedReplies.unknownPlace;
    return state.directions && state.directions.fromAnchorId === anchorId ? state.directions.textZh : groundedReplies.noRoute;
  }
  if (evaluation.intent === 'request_photo') {
    const photo = state.photo && state.photo.passerbyAnchorId === anchorId ? state.photo : null;
    return !photo ? groundedReplies.photoNoRiver : photo.status === 'accepted' ? groundedReplies.photoAccepted : groundedReplies.photoPending;
  }
  return evaluation.replyZh;
}
/** World-backed preconditions for a successful turn; the graph transition still decides progress. */
function applyWorldFacts(state: InternalState, npcId: NpcId, anchor: WorldAnchor, evaluation: TurnEvaluation, world: WorldView, events: EngineResult['events']): void {
  if (state.missionId === 'Q2' && npcId === 'guide' && evaluation.intent === 'ask_directions' && evaluation.slots.some((entry) => entry.key === 'destination' && entry.value === 'grand-hotel')) {
    const directions = world.directionsToHotel(anchor.id);
    if (!directions) return;
    state.directions = directions;
    state.flags['q2.route-verified'] = true;
    events.push({ id: `${state.attemptId}.directions`, kind: 'directions', message: directions.steps.map((step) => step.english).join(' ').slice(0, 240) });
  }
  if (state.missionId === 'Q3' && npcId === 'passerby' && evaluation.intent === 'request_photo') {
    if (state.photo && state.photo.passerbyAnchorId === anchor.id && state.photo.status !== 'captured') return;
    const viewpoint = world.anchorsNear(anchor.position, PHOTO_VIEWPOINT_RADIUS).filter((entry) => entry.capability === 'river-viewpoint')
      .sort((a, b) => distance(a.position, anchor.position) - distance(b.position, anchor.position))[0];
    if (!viewpoint) return;
    state.photo = { id: `${state.attemptId}.photo-${state.version + 1}`.slice(-120), passerbyAnchorId: anchor.id, viewpointAnchorId: viewpoint.id, spot: viewpoint.position, status: 'accepted', attempts: 0 };
    state.flags['q3.request-accepted'] = true;
    events.push({ id: `${state.attemptId}.photo-accepted`, kind: 'photo', message: 'They agreed! Stand at the photo spot with the river behind you.' });
  }
}
/** The goal a request asks this NPC for, as a canonical evaluation (so a remembered request can be delivered later). */
function goalOf(npcId: NpcId, evaluation: TurnEvaluation): TurnEvaluation | null {
  const slot = (key: string) => evaluation.slots.find((entry) => entry.key === key)?.value;
  if (npcId === 'vendor' && ['order_drink', 'accept_substitute', 'confirm_drink_price'].includes(evaluation.intent) && (slot('drink') === 'tea' || slot('drink') === 'water')) return evaluation;
  if (npcId === 'guide' && evaluation.intent === 'ask_directions' && slot('destination') === 'grand-hotel') return evaluation;
  if (npcId === 'passerby' && evaluation.intent === 'request_photo') return evaluation;
  return null;
}
function rememberedGoal(npcId: NpcId, value: string, like: TurnEvaluation): TurnEvaluation {
  const base = { ...like, interaction: 'relevant' as const, targetLanguageUse: 'yes' as const };
  if (npcId === 'vendor') return { ...base, intent: 'order_drink', slots: [{ key: 'drink', value: value as 'tea' | 'water' }] };
  if (npcId === 'guide') return { ...base, intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] };
  return { ...base, intent: 'request_photo', slots: [] };
}
/**
 * Warm-up pacing (deterministic): the NPC delivers the goal only from exchange GOAL_WARMUP_EXCHANGES on.
 * An earlier goal request is remembered and deferred with an in-character line; once warmed up, the
 * remembered request is delivered on the player's next ordinary turn, so a focused player always gets it
 * well before the patience limit. `session.warmed-<role>` skips the warm-up (test seam for goal mechanics).
 */
function paceGoal(state: InternalState, npcId: NpcId, evaluation: TurnEvaluation, successful: boolean): { deferred: boolean; evaluation: TurnEvaluation } {
  const key = `${prefix(state)}.goal-asked`;
  if (evaluation.intent === 'cancel_order') delete state.flags[key];
  const asked = successful ? goalOf(npcId, evaluation) : null;
  if (asked) state.flags[key] = npcId === 'vendor' ? String(asked.slots.find((entry) => entry.key === 'drink')!.value) : npcId;
  const exchange = Number(state.flags[`${prefix(state)}.exchanges`] ?? 0) + 1;
  const warmed = exchange >= GOAL_WARMUP_EXCHANGES || Boolean(state.flags[`session.warmed-${npcId}`]);
  const remembered = state.flags[key];
  if (asked) return { deferred: !warmed, evaluation };
  // Warmed up with an earlier request pending: the NPC comes back to it ("你要的水，五块。") on any ordinary turn.
  if (warmed && typeof remembered === 'string' && !offTarget(evaluation) && !['farewell', 'cancel_order', 'request_repeat'].includes(evaluation.intent)) return { deferred: false, evaluation: rememberedGoal(npcId, remembered, evaluation) };
  return { deferred: false, evaluation };
}
export function applyEvaluation(state: InternalState, npcId: NpcId, anchorId: string, raw: TurnEvaluation, nowMs: number, world: WorldView): EngineResult {
  nowMs = Math.floor(nowMs); // timestamps are integer ms
  const result = synchronizeGame(state, nowMs);
  const next = result.state;
  let evaluation = completeDrinkConfirmation(next, TurnEvaluationSchema.parse(raw));
  dialogueContext(next, npcId, anchorId, world);
  const anchor = world.anchor(anchorId)!;
  requireRule(next.pendingTurn?.npcId === npcId && next.pendingTurn.anchorId === anchorId && next.pendingTurn.attemptId === next.attemptId, 'Evaluation requires a current server-reserved turn.');
  const npc = next.npcState[npcId];
  npc.anchorId = anchorId;
  if (npc.patience === 0) npc.patience = 1;
  const raw0 = evaluation;
  const successful = evaluation.interaction === 'relevant' && evaluation.targetLanguageUse === 'yes' && evaluation.intentGrade.score >= 0.7 && evaluation.intentGrade.confidence >= 0.75;
  const pacing = next.status === 'active' ? paceGoal(next, npcId, raw0, successful) : { deferred: false, evaluation: raw0 };
  const paced = pacing.deferred;
  if (pacing.evaluation !== raw0) evaluation = pacing.evaluation; // delivering a remembered request
  // An understood request is conversation evidence even when the NPC answers with a question first.
  if (paced) evidence(next, 'conversation', 1, undefined, next.pendingTurn!.assisted, next.nodeId);
  let transitioned = false;
  if ((successful || pacing.evaluation !== raw0) && !paced) {
    const before = next.nodeId;
    applyWorldFacts(next, npcId, anchor, evaluation, world, result.events);
    const options = currentNode(next).intentTransitions.filter((entry) => entry.trigger.intent === evaluation.intent);
    const relevantDecision = options.length > 0;
    const missingDetail = relevantDecision && options.some((entry) => entry.trigger.slots.some((required) => !evaluation.slots.some((slot) => slot.key === required.key)));
    const skillFlag = (kind: string) => `${prefix(next)}.skill-${kind}-${before.split('.')[1]}`;
    transitioned = transition(next, evaluation, result.events);
    if (transitioned) {
      npc.patience = Math.min(5, npc.patience + 1);
      evidence(next, 'conversation', 1, undefined, next.pendingTurn!.assisted, before);
      if (next.flags[skillFlag('ambiguous')]) evidence(next, 'repair', 0.5, undefined, next.pendingTurn!.assisted || Boolean(next.flags[skillFlag('example')]));
    } else if (relevantDecision) {
      evidence(next, 'conversation', 0, undefined, next.pendingTurn!.assisted, before);
      if (missingDetail) next.flags[skillFlag('ambiguous')] = true;
      if (evaluation.coach?.improvedExample) next.flags[skillFlag('example')] = true;
    }
  }
  const conversationEnded = evaluation.intent === 'farewell' && successful;
  // A miss surfaces the node's vocabulary once, recorded like a used hint (assisted) without spending one.
  if (!transitioned && !paced && next.status === 'active' && !['greeting', 'small_talk', 'request_repeat', 'farewell'].includes(evaluation.intent) && Number(next.flags[`${next.nodeId}-hint-level`] ?? 0) < 2) {
    const hint = missionFor(next.missionId).hints.find((entry) => entry.nodeId === next.nodeId && entry.level === 2);
    if (hint) {
      next.flags[`${next.nodeId}-hint-level`] = 2; next.flags['session.assisted'] = true;
      result.events.push({ id: `${next.attemptId}.vocab-${next.nodeId}`, kind: 'objective', message: `Hint: ${hint.text}` });
    }
  }
  if (evaluation.intent === 'request_repeat') {
    npc.repeatCount++;
    if (npc.repeatCount > 1) npc.patience = Math.max(1, npc.patience - 1);
  } else if (offTarget(evaluation)) {
    npc.patience = Math.max(0, npc.patience - 1);
    next.xp = Math.max(0, next.xp - 5);
    const name = label(anchor);
    result.events.push({ id: `${next.attemptId}.language-${next.pendingTurn!.turnId}`, kind: 'objective', message: evaluation.interaction === 'insult' ? `${name} is upset: -5 XP. Stay polite.` : evaluation.targetLanguageUse === 'no' ? `${name} didn't understand English: -5 XP. Try it in Mandarin.` : `${name} didn't follow that: -5 XP. Try a short Mandarin sentence.` });
  }
  npc.mood = mood(npc.patience);
  const deferrals = `${prefix(next)}.deferrals`;
  let reply = groundedReply(next, npcId, evaluation, world);
  if (paced) { const n = Number(next.flags[deferrals] ?? 0); reply = pacingReplies[npcId][n % pacingReplies[npcId].length]!; next.flags[deferrals] = n + 1; }
  // Patience: every exchange with this quest's NPC counts until the goal is reached. Impatience shows
  // in character near the limit; at the limit the NPC leaves and the attempt fails. Deterministic: the model never decides it.
  let gaveUp = false;
  if (next.status === 'active') {
    const key = `${prefix(next)}.exchanges`;
    const exchanges = Number(next.flags[key] ?? 0) + 1;
    next.flags[key] = exchanges;
    if (exchanges >= NPC_PATIENCE_LIMIT) {
      reply = impatienceReplies[npcId].leave; gaveUp = true; npc.mood = 'disengaged';
      terminal(next, 'fail', result.events, `${label(anchor)} got tired of chatting — try again and get to the point sooner.`);
    } else if (exchanges >= NPC_PATIENCE_LIMIT - 3) {
      if (exchanges === NPC_PATIENCE_LIMIT - 3 || exchanges === NPC_PATIENCE_LIMIT - 1) reply = `${reply}${impatienceReplies[npcId][exchanges === NPC_PATIENCE_LIMIT - 1 ? 'last' : 'first']}`;
      const cap = exchanges >= NPC_PATIENCE_LIMIT - 1 ? 'terse' : 'neutral';
      if (MOOD_RANK[npc.mood] > MOOD_RANK[cap]) npc.mood = cap;
    }
  }
  // The NPC closing the exchange ("慢走啊！") ends it too; a requested repeat of an earlier goodbye does not.
  const npcClosed = gaveUp || (evaluation.intent !== 'request_repeat' && isClosingLine(reply));
  npc.history.push({ role: 'player', text: next.pendingTurn!.text }, { role: 'npc', text: reply });
  npc.history = npc.history.slice(-12);
  return { state: InternalStateSchema.parse(next), events: result.events, ...(conversationEnded || npcClosed ? { conversationEnded: true as const } : {}) };
}

function interactable(state: InternalState, anchor: WorldAnchor): PublicInteractable | null {
  const mission = missionFor(state.missionId);
  const base = { id: anchor.id, label: label(anchor), position: anchor.position };
  if (anchor.kind === 'npc') {
    if (!anchor.role || !mission.npcRoles.includes(anchor.role)) return null;
    const payable = Boolean(orderedDrink(state)) && anchor.id === state.npcState.vendor.anchorId;
    return { ...base, kind: 'npc', role: anchor.role, ...(payable ? { choiceId: 'q1.pay' as const } : {}) };
  }
  if (anchor.capability === 'hotel-landmark') return { ...base, kind: 'landmark' };
  if (anchor.capability === 'river-viewpoint' && state.missionId === 'Q3') {
    return state.photo?.viewpointAnchorId === anchor.id && state.photo.status !== 'captured' ? { ...base, kind: 'photo-spot', position: state.photo.spot, choiceId: 'q3.start-photo' } : { ...base, kind: 'landmark' };
  }
  return null;
}
/** Buttons each NPC conversation offers now. Pure function of engine state; the model never grants them. */
export function npcActions(state: InternalState): PublicState['npcActions'] {
  const out: PublicState['npcActions'] = [];
  const drink = orderedDrink(state);
  if (drink) out.push({ anchorId: state.npcState.vendor.anchorId!, action: { kind: 'pay', anchorId: state.npcState.vendor.anchorId!, drink, priceCny: DRINK_PRICES[drink] } });
  if (state.directions) out.push({ anchorId: state.directions.fromAnchorId, action: { kind: 'show-directions' } });
  if (state.photo && (state.photo.status === 'accepted' || state.photo.status === 'countdown')) out.push({ anchorId: state.photo.passerbyAnchorId, action: { kind: 'go-to-photo-spot', spot: state.photo.spot } });
  // A finished quest closes its NPC's conversation.
  if (state.status === 'cleared') for (const role of missionFor(state.missionId).npcRoles) { const anchorId = state.npcState[role].anchorId; if (anchorId) out.push({ anchorId, action: { kind: 'end-conversation' } }); }
  return out.slice(0, 8);
}
/**
 * The quest-finishing button now waiting on this NPC role. While it waits the conversation is over:
 * turns are rejected and only the button finishes the task. An unaffordable Pay doesn't count, so talking
 * stays possible; a failed photo capture keeps go-to-photo-spot, so the retry needs no talking.
 */
export function pendingGoalAction(actions: PublicState['npcActions'], cny: number, role: NpcId): PublicState['npcActions'][number] | undefined {
  return actions.find(({ action }) => (role === 'vendor' && action.kind === 'pay' && action.priceCny <= cny) || (role === 'passerby' && action.kind === 'go-to-photo-spot'));
}
/** The actions for one conversation after a turn; a goodbye always offers to end it. */
export function turnActions(state: InternalState, anchorId: string, conversationEnded: boolean): NpcAction[] {
  const actions = npcActions(state).filter((entry) => entry.anchorId === anchorId).map((entry) => entry.action);
  if (conversationEnded && !actions.some((action) => action.kind === 'end-conversation')) actions.push({ kind: 'end-conversation' });
  return actions.slice(0, 4);
}
export function projectPublicState(state: InternalState, nowMs: number, world: WorldView): PublicState {
  const next = synchronizeGame(state, nowMs).state;
  const mission = missionFor(next.missionId);
  const nearby = world.anchorsNear(next.position, INTERACTABLE_RADIUS).sort((a, b) => distance(a.position, next.position) - distance(b.position, next.position));
  const photoAnchor = next.photo ? world.anchor(next.photo.viewpointAnchorId) : undefined;
  if (photoAnchor && !nearby.some((entry) => entry.id === photoAnchor.id)) nearby.unshift(photoAnchor);
  const interactables = nearby.flatMap((anchor) => {
    const entry = interactable(next, anchor);
    // The pay step is also its own choice target at the vendor, alongside the NPC.
    return !entry ? [] : entry.choiceId === 'q1.pay' ? [entry, { id: `${anchor.id}.pay`, kind: 'choice' as const, label: '付款', position: anchor.position, choiceId: 'q1.pay' as const }] : [entry];
  }).slice(0, 40);
  return PublicStateSchema.parse({
    sessionId: next.sessionId, worldId: next.worldId, version: next.version, missionId: next.missionId, mode: next.mode, status: next.status, zoneId: next.zoneId, position: next.position, tier: next.tier,
    objectives: mission.nodes.map((node) => ({ id: node.id, label: node.objective, complete: next.status === 'cleared' || Boolean(next.flags[node.id]) })),
    interactables,
    npcMood: Object.fromEntries(npcs.map((npc) => [npc.id, next.npcState[npc.id].mood])), inventory: next.inventory, purchases: next.purchases,
    xp: next.xp, badges: next.badges, unlockedMissionIds: next.unlockedMissionIds, completedMissionIds: next.completedMissionIds,
    directions: next.directions, photo: next.photo, npcActions: npcActions(next), questTarget: questTarget(next, world), timer: null,
    capabilities: { coach: true, hints: true, freeze: false }, validationMode: next.validationMode, inputPreference: next.inputPreference, providerStatus: next.providerStatus,
    ...(next.debrief ? { debrief: next.debrief } : {}),
  });
}
