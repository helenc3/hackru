import { z } from 'zod';

// All boundary numbers are finite. These generous session caps prevent unbounded
// payloads without substituting schema validation for the engine's rules.
const unit = z.number().finite().min(0).max(1);
const count = z.number().int().min(0).max(1_000_000);
const timestamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const identifier = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const shortText = z.string().min(1).max(240);

// 2.0: the station campaign (P1/P2/B1) is replaced by three Shanghai exploration quests in a
// streamed city (docs/CITY_GENERATION.md, docs/NEW_QUESTS.md). City chunk contracts live in ./city/contracts.ts.
export const CONTRACT_VERSION = '2.0' as const;
/** Q1 buy a drink · Q2 directions to 上海大酒店 · Q3 photo at the Huangpu River. Offered in order. */
export const MissionIdSchema = z.enum(['Q1', 'Q2', 'Q3']);
/** A position's zone is its district kind, derived by the server from committed chunk manifests. */
export const ZoneIdSchema = z.enum(['shopping', 'historic', 'residential', 'office', 'waterfront', 'park', 'industrial']);
/** NPC roles. Many anchor instances in the city share a role; dialogue state is per role. */
export const NpcIdSchema = z.enum(['vendor', 'guide', 'passerby']);
/** Authored text identifiers for scenery signs. Positions come from chunk anchors. */
export const CueIdSchema = z.enum(['q1.menu', 'q2.hotel-sign', 'q3.river-sign']);
export const ChoiceIdSchema = z.enum(['q1.pay', 'q3.start-photo']);
export const IntentSchema = z.enum(['order_drink', 'accept_substitute', 'cancel_order', 'confirm_drink_price', 'ask_directions', 'request_photo', 'request_repeat', 'greeting', 'small_talk', 'farewell', 'unknown']);
export const GameActionTypeSchema = z.enum(['move', 'choose', 'photoCapture', 'audioPhase', 'useItem', 'pausePractice', 'resumePractice', 'setInputPreference', 'startMission']);
export const DESTINATION_ALIASES = {
  'grand-hotel': ['上海大酒店', '大酒店', 'Shanghai Grand Hotel'],
  'huangpu-river': ['黄浦江', '江边', '外滩', 'Huangpu River'],
} as const;
export const ModeSchema = z.enum(['practice']);
export const TrackSchema = z.enum(['reading', 'listening', 'conversation', 'repair']);
export const ItemSchema = z.enum(['hint']);
export const DrinkSchema = z.enum(['coffee', 'tea', 'water']);
export const TierSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const InputPreferenceSchema = z.enum(['voice', 'typed-accessibility']);
export const InputSourceSchema = z.enum(['typed', 'stt', 'stt-edited']);
export const ConversationSourceSchema = z.enum(['spoken', 'typed', 'edited']);
export const AudioPhaseSchema = z.enum(['recording', 'transcribing', 'confirming', 'playing', 'idle']);
export const StatusSchema = z.enum(['active', 'cleared', 'failed']);
export const MoodSchema = z.enum(['warm', 'neutral', 'terse', 'disengaged']);
export const ProviderStatusSchema = z.enum(['live', 'degraded', 'fixture']);
/** World units. The streamed city is unbounded in principle; this cap bounds payloads (±250 chunks of 40). */
export const WORLD_LIMIT = 10_000;
export const PositionSchema = z.strictObject({ x: z.number().finite().min(-WORLD_LIMIT).max(WORLD_LIMIT), z: z.number().finite().min(-WORLD_LIMIT).max(WORLD_LIMIT) });
export const GradeSchema = z.strictObject({ score: unit, confidence: unit });
/** Fixed movement rules shared by client prediction and server validation. */
export const WORLD_RULES = { movementSpeed: 4, interactionRadius: 2, playerRadius: 0.35 } as const;

export type MissionId = z.infer<typeof MissionIdSchema>;
export type ZoneId = z.infer<typeof ZoneIdSchema>;
export type NpcId = z.infer<typeof NpcIdSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Drink = z.infer<typeof DrinkSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type InputSource = z.infer<typeof InputSourceSchema>;

export const GameActionSchema = z.discriminatedUnion('type', [
  /** Server derives zone/chunk from committed manifests; the position must lie in a committed, walkable chunk. */
  z.strictObject({ type: z.literal('move'), position: PositionSchema }),
  /** anchorId: the vendor anchor for q1.pay; the photo-spot anchor for q3.start-photo. */
  z.strictObject({ type: z.literal('choose'), choiceId: ChoiceIdSchema, anchorId: identifier }),
  /** Acknowledges the NPC-triggered countdown capture for the server-issued photo request. */
  z.strictObject({ type: z.literal('photoCapture'), photoRequestId: identifier, outcome: z.enum(['captured', 'failed']), imageDigest: z.string().regex(/^[a-f0-9]{16,128}$/).optional() }),
  z.strictObject({ type: z.literal('audioPhase'), operationId: identifier, phase: AudioPhaseSchema }),
  z.strictObject({ type: z.literal('useItem'), item: ItemSchema }),
  z.strictObject({ type: z.literal('pausePractice') }),
  z.strictObject({ type: z.literal('resumePractice') }),
  z.strictObject({ type: z.literal('setInputPreference'), preference: InputPreferenceSchema }),
  z.strictObject({ type: z.literal('startMission'), missionId: MissionIdSchema }),
]);
export type GameAction = z.infer<typeof GameActionSchema>;
export const ActionRequestSchema = z.strictObject({ actionId: identifier, expectedVersion: count, action: GameActionSchema });
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export const PlayerTextSchema = z.string().min(1).max(500).refine((text) => text.trim().length > 0, 'Player input cannot be blank.');
export const TurnInputSchema = z.strictObject({ text: PlayerTextSchema, source: InputSourceSchema, transcriptionId: identifier.optional() }).superRefine((input, context) => {
  if (input.source !== 'typed' && !input.transcriptionId) context.addIssue({ code: 'custom', path: ['transcriptionId'], message: 'STT input requires a server-issued transcription ID.' });
  if (input.source === 'typed' && input.transcriptionId) context.addIssue({ code: 'custom', path: ['transcriptionId'], message: 'Typed input has no transcription provenance.' });
});
/** npcId is the role; anchorId is the specific NPC instance in a committed chunk (proximity is checked against it). */
export const TurnRequestSchema = z.strictObject({ turnId: identifier, expectedVersion: count, npcId: NpcIdSchema, anchorId: identifier, input: TurnInputSchema });
export type TurnRequest = z.infer<typeof TurnRequestSchema>;
/** worldId selects the persistent city; omitted → the server mints a new world (new seed). */
export const CreateSessionRequestSchema = z.strictObject({ initialTier: z.union([z.literal(0), z.literal(1)]), providerMode: z.enum(['live', 'fixture']), validationMode: z.boolean().default(false), inputPreference: InputPreferenceSchema.default('voice'), worldId: identifier.optional() });
export type CreateSessionRequest = z.input<typeof CreateSessionRequestSchema>;

export const SkillTrackSchema = z.strictObject({ mastery: unit, independentCount: count });
export const SkillTracksSchema = z.strictObject({ reading: SkillTrackSchema, listening: SkillTrackSchema, conversation: SkillTrackSchema, repair: SkillTrackSchema });
export const EvidenceSummarySchema = z.strictObject({ spokenTurns: count, typedTurns: count, editedTurns: count, independentListening: count, assistedListening: count });
export const DebriefSchema = z.strictObject({ tracks: SkillTracksSchema, strengths: z.array(shortText).max(4), improvement: shortText, nextPracticeReason: shortText, nextPracticeMissionId: MissionIdSchema.optional(), evidenceSummary: EvidenceSummarySchema });
export type Debrief = z.infer<typeof DebriefSchema>;
export const PurchaseRecordSchema = z.strictObject({ id: identifier, attemptId: identifier, anchorId: identifier, drink: DrinkSchema.exclude(['coffee']), priceCny: z.number().int().min(0).max(1000), atMs: timestamp });
export const InventorySchema = z.strictObject({ hint: z.number().int().min(0).max(3), cny: z.number().int().min(0).max(1000), drinks: z.array(DrinkSchema.exclude(['coffee'])).max(20) });
export type Inventory = z.infer<typeof InventorySchema>;
export const InteractableKindSchema = z.enum(['npc', 'choice', 'photo-spot', 'landmark']);
export const PublicInteractableSchema = z.strictObject({ id: identifier, kind: InteractableKindSchema, role: NpcIdSchema.optional(), label: shortText, position: PositionSchema, choiceId: ChoiceIdSchema.optional() });
export type PublicInteractable = z.infer<typeof PublicInteractableSchema>;
/** Server-verified route from the committed street graph (Q2). Never model-authored. */
export const DirectionsSchema = z.strictObject({ routeId: identifier, fromAnchorId: identifier, hotelAnchorId: identifier, textZh: z.string().min(1).max(240), steps: z.array(z.strictObject({ textZh: z.string().min(1).max(80), english: shortText })).min(1).max(8) });
export type Directions = z.infer<typeof DirectionsSchema>;
export const PhotoStatusSchema = z.enum(['accepted', 'countdown', 'captured', 'failed']);
/** Q3 photo interaction, issued only after the server accepts a request_photo turn with an eligible passerby. */
export const PhotoRequestSchema = z.strictObject({ id: identifier, passerbyAnchorId: identifier, viewpointAnchorId: identifier, spot: PositionSchema, status: PhotoStatusSchema, countdownEndsAtMs: timestamp.optional(), attempts: z.number().int().min(0).max(20) });
export const PHOTO_RULES = { spotRadius: 1.5, countdownMs: 3_000, captureWindowMs: 15_000 } as const;

/** UI affordances the server enables for an NPC conversation. Derived deterministically from engine state; the model never grants them. */
export const NpcActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('pay'), anchorId: identifier, drink: DrinkSchema.exclude(['coffee']), priceCny: z.number().int().min(0).max(1000) }),
  z.strictObject({ kind: z.literal('end-conversation') }),
  z.strictObject({ kind: z.literal('show-directions') }),
  z.strictObject({ kind: z.literal('go-to-photo-spot'), spot: PositionSchema }),
]);
export type NpcAction = z.infer<typeof NpcActionSchema>;
/** Where the active quest's next step is (server-derived from the planner/committed anchors). Guidance only: never progress. */
export const QuestTargetSchema = z.strictObject({ label: shortText, english: shortText, position: PositionSchema, anchorId: identifier.optional() });
export type QuestTarget = z.infer<typeof QuestTargetSchema>;
export const PublicStateSchema = z.strictObject({
  sessionId: identifier, worldId: identifier, version: count, missionId: MissionIdSchema, mode: ModeSchema,
  status: StatusSchema, zoneId: ZoneIdSchema, position: PositionSchema, tier: TierSchema,
  objectives: z.array(z.strictObject({ id: identifier, label: shortText, complete: z.boolean() })).max(20),
  /** Anchors from committed chunks near the player that the current quest can use, plus quest-specific spots. */
  interactables: z.array(PublicInteractableSchema).max(40),
  npcMood: z.record(NpcIdSchema, MoodSchema), inventory: InventorySchema, purchases: z.array(PurchaseRecordSchema).max(50),
  xp: count, badges: z.array(identifier).max(10), unlockedMissionIds: z.array(MissionIdSchema).min(1).max(3), completedMissionIds: z.array(MissionIdSchema).max(3),
  directions: DirectionsSchema.nullable(), photo: PhotoRequestSchema.nullable(),
  /** Current per-NPC actions, so a reopened conversation shows the same buttons as the last turn. */
  npcActions: z.array(z.strictObject({ anchorId: identifier, action: NpcActionSchema })).max(8),
  questTarget: QuestTargetSchema.nullable().optional(),
  timer: z.null(),
  capabilities: z.strictObject({ coach: z.boolean(), hints: z.boolean(), freeze: z.literal(false) }),
  validationMode: z.boolean(), inputPreference: InputPreferenceSchema, providerStatus: ProviderStatusSchema,
  debrief: DebriefSchema.optional(),
}).superRefine((state, context) => {
  if (state.status === 'active' && state.debrief) context.addIssue({ code: 'custom', path: ['debrief'], message: 'Debrief exists only after an attempt ends.' });
  for (const [field, values] of [['objectives', state.objectives], ['interactables', state.interactables]] as const) {
    if (new Set(values.map((value) => value.id)).size !== values.length) context.addIssue({ code: 'custom', path: [field], message: 'IDs must be unique.' });
  }
});
export type PublicState = z.infer<typeof PublicStateSchema>;
export const CoachFeedbackSchema = z.strictObject({ understood: shortText, explanation: shortText, improvedExample: shortText });
export const GameEventSchema = z.strictObject({ id: identifier, kind: z.enum(['objective', 'reward', 'result', 'photo', 'directions']), message: shortText });
export type GameEvent = z.infer<typeof GameEventSchema>;
export const ActionResponseSchema = z.strictObject({ state: PublicStateSchema, events: z.array(GameEventSchema).max(20) });
export type ActionResponse = z.infer<typeof ActionResponseSchema>;
export const StateResponseSchema = z.strictObject({ state: PublicStateSchema });
export const TurnResponseSchema = z.strictObject({ turnId: identifier, state: PublicStateSchema, events: z.array(GameEventSchema).max(20), npcReply: z.string().min(1).max(240), actions: z.array(NpcActionSchema).max(4).optional(), speechId: identifier.optional(), feedback: CoachFeedbackSchema.optional(), vibe: z.strictObject({ intent: unit, clarity: unit, courtesy: unit }).optional(), conversationEnded: z.literal(true).optional() });
export type TurnResponse = z.infer<typeof TurnResponseSchema>;

export const SlotSchema = z.discriminatedUnion('key', [
  z.strictObject({ key: z.literal('drink'), value: DrinkSchema }),
  /** 'other' = the player asked for a place the NPC cannot route to; the NPC says so instead of inventing one. */
  z.strictObject({ key: z.literal('destination'), value: z.enum(['grand-hotel', 'huangpu-river', 'other']) }),
  z.strictObject({ key: z.literal('priceCny'), value: z.number().int().min(0).max(1000) }),
]);
export type Slot = z.infer<typeof SlotSchema>;
export const INTENT_SLOT_KEYS: Record<Intent, readonly Slot['key'][]> = {
  order_drink: ['drink'], accept_substitute: ['drink'], cancel_order: [], confirm_drink_price: ['drink', 'priceCny'], ask_directions: ['destination'],
  request_photo: [], request_repeat: [], greeting: [], small_talk: [], farewell: [], unknown: [],
};
export const TurnEvaluationSchema = z.strictObject({
  intent: IntentSchema, slots: z.array(SlotSchema).max(2), evidenceQuote: z.string().max(500),
  intentGrade: GradeSchema, clarity: unit, courtesy: unit,
  targetLanguageUse: z.enum(['yes', 'mixed', 'no', 'uncertain']), interaction: z.enum(['relevant', 'repeat', 'irrelevant', 'insult']),
  replyZh: z.string().min(1).max(80), coach: CoachFeedbackSchema.nullable(),
}).superRefine((evaluation, context) => {
  if (new Set(evaluation.slots.map((slot) => slot.key)).size !== evaluation.slots.length) context.addIssue({ code: 'custom', path: ['slots'], message: 'A slot key may appear only once.' });
  evaluation.slots.forEach((slot, index) => {
    if (!INTENT_SLOT_KEYS[evaluation.intent].includes(slot.key)) context.addIssue({ code: 'custom', path: ['slots', index], message: 'Slot is not allowed for this intent.' });
    if (['accept_substitute', 'confirm_drink_price'].includes(evaluation.intent) && slot.key === 'drink' && slot.value === 'coffee') context.addIssue({ code: 'custom', path: ['slots', index], message: 'Only tea/water are available drinks.' });
  });
});
export type TurnEvaluation = z.infer<typeof TurnEvaluationSchema>;
export const TurnContextSchema = z.strictObject({ missionId: MissionIdSchema, mode: ModeSchema, tier: TierSchema, npcId: NpcIdSchema, anchorId: identifier, nameZh: shortText, persona: z.string().min(1).max(500), patience: z.number().int().min(0).max(5), allowedIntents: z.array(IntentSchema).min(1).max(10), facts: z.record(identifier, z.string().max(500)), history: z.array(z.strictObject({ role: z.enum(['player', 'npc']), text: z.string().max(500) })).max(12) });
export type TurnContext = z.infer<typeof TurnContextSchema>;
export interface DialogueProvider { evaluate(context: TurnContext, playerText: string): Promise<TurnEvaluation> }
export interface SpeechProvider { synthesize(text: string, voiceKey: string): Promise<Uint8Array>; synthesizePcm?(text: string, voiceKey: string): Promise<Uint8Array>; /** PCM16LE 24 kHz chunks as they are generated; every chunk has an even byte length. */ streamPcm?(text: string, voiceKey: string): AsyncIterable<Uint8Array>; transcribe(audio: Uint8Array, mimeType: string): Promise<string> }

// Context-dependent validation stays reusable for the provider owner. Validation only:
// confidence thresholds and progression belong to the engine.
export function validateEvaluationForContext(value: unknown, context: TurnContext, playerText: string): TurnEvaluation {
  const evaluation = TurnEvaluationSchema.parse(value);
  const validatedContext = TurnContextSchema.parse(context);
  if (!validatedContext.allowedIntents.includes(evaluation.intent) && evaluation.intent !== 'unknown') throw new Error('Evaluation intent is not allowed in the active scene.');
  if (!playerText.includes(evaluation.evidenceQuote)) throw new Error('Evaluation evidence is not a substring of player input.');
  if (evaluation.interaction === 'relevant' && evaluation.intent !== 'unknown' && !evaluation.evidenceQuote.trim()) throw new Error('Relevant evaluations require supporting evidence.');
  return evaluation;
}

export const ApiErrorSchema = z.strictObject({ error: z.strictObject({ code: identifier, message: shortText, retryable: z.boolean() }), state: PublicStateSchema.optional() });
export type ApiError = z.infer<typeof ApiErrorSchema>;
export const TranscriptionResponseSchema = z.strictObject({ text: PlayerTextSchema, transcriptionId: identifier });
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;
export const TranscriptionRecordSchema = z.strictObject({ id: identifier, sessionId: identifier, attemptId: identifier, originalText: PlayerTextSchema, editedText: PlayerTextSchema.optional(), createdAtMs: timestamp, expiresAtMs: timestamp }).superRefine((record, context) => {
  if (record.expiresAtMs <= record.createdAtMs) context.addIssue({ code: 'custom', path: ['expiresAtMs'], message: 'Transcription expiry must follow creation.' });
});
export type TranscriptionRecord = z.infer<typeof TranscriptionRecordSchema>;
// Set by the server after checking its transcription record. Public evaluation cannot
// claim microphone use or independent skill evidence.
export const TurnProvenanceRecordSchema = z.strictObject({ turnId: identifier, sessionId: identifier, attemptId: identifier, npcId: NpcIdSchema, anchorId: identifier, text: PlayerTextSchema, source: InputSourceSchema, transcriptionId: identifier.optional(), originalSttText: PlayerTextSchema.optional(), assisted: z.boolean(), createdAtMs: timestamp }).superRefine((record, context) => {
  if (record.source !== 'typed' && (!record.transcriptionId || !record.originalSttText)) context.addIssue({ code: 'custom', path: ['transcriptionId'], message: 'Verified STT provenance requires the server record and original text.' });
  if (record.source === 'stt' && record.text !== record.originalSttText) context.addIssue({ code: 'custom', path: ['source'], message: 'Only unchanged server-verified STT can be marked stt.' });
  if (record.source === 'stt-edited' && record.text === record.originalSttText) context.addIssue({ code: 'custom', path: ['source'], message: 'Edited STT must differ from the original.' });
  if (record.source === 'typed' && (record.transcriptionId || record.originalSttText)) context.addIssue({ code: 'custom', path: ['source'], message: 'Typed provenance contains no claimed STT record.' });
});

/** onTalk receives the NPC anchor; the role is on the interactable. */
export type RendererProps = { state: PublicState; onAction: (action: GameAction) => Promise<void>; onTalk: (anchorId: string) => void };
export type SkillDebriefProps = { state: PublicState };
export type AudioControllerProps = { state: PublicState; onAction: RendererProps['onAction']; speechId?: string };
export type RecorderProps = { state: PublicState; npcId: NpcId; onAction: RendererProps['onAction']; onTranscript: (transcription: TranscriptionResponse) => void };

export const FlagIdSchema = z.string().regex(/^(q1|q2|q3|session)\.[a-z][a-z0-9-]{0,63}$/);
export const FlagValueSchema = z.union([z.boolean(), z.string().max(120), z.number().finite().min(0).max(1_000_000)]);
export const FlagsSchema = z.record(FlagIdSchema, FlagValueSchema);
export const ResultSchema = z.enum(['none', 'clear', 'fail']);
export const GuardSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('flagEquals'), flag: FlagIdSchema, value: FlagValueSchema }),
  z.strictObject({ op: z.literal('flagExists'), flag: FlagIdSchema }),
]);
export type Guard = z.infer<typeof GuardSchema>;
const transitionFields = { requiredFlags: z.record(FlagIdSchema, FlagValueSchema), guards: z.array(GuardSchema).max(20), setFlags: FlagsSchema, nextNode: identifier.nullable(), result: ResultSchema };
/** Action triggers match on `type` and (for choose) `choiceId`; anchors are checked by the engine, not the graph. */
export const ActionTriggerSchema = z.strictObject({ type: GameActionTypeSchema, choiceId: ChoiceIdSchema.optional(), outcome: z.enum(['captured', 'failed']).optional() });
export const ActionTransitionSchema = z.strictObject({ trigger: ActionTriggerSchema, ...transitionFields });
export const IntentTransitionSchema = z.strictObject({ trigger: z.strictObject({ intent: IntentSchema, slots: z.array(SlotSchema).max(2) }), ...transitionFields });
export const MissionNodeSchema = z.strictObject({ id: identifier, objective: shortText, actionTransitions: z.array(ActionTransitionSchema).max(30), intentTransitions: z.array(IntentTransitionSchema).max(20), checkpoint: z.boolean().default(false) });
export const RewardDefinitionSchema = z.strictObject({ id: identifier, xp: z.number().int().min(0).max(150), items: z.strictObject({ hint: z.number().int().min(0).max(3) }), badge: z.literal('shanghai-explorer').optional() });
export const FactSnapshotSchema = z.strictObject({ id: identifier, facts: z.record(identifier, z.string().max(500)) });
export const PracticeHintSchema = z.strictObject({ id: identifier, nodeId: identifier, level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: shortText, exampleZh: z.string().max(80).optional(), pinyin: z.string().max(240).optional() });
export const MissionVariantSchema = z.strictObject({ tier: TierSchema, factSnapshots: z.array(FactSnapshotSchema).min(1).max(10), targetTracks: z.array(TrackSchema).min(1).max(4), cueIds: z.array(CueIdSchema).max(12) });
export const MissionDefinitionSchema = z.strictObject({ id: MissionIdSchema, mode: ModeSchema, title: shortText, startNode: identifier, nodes: z.array(MissionNodeSchema).min(1).max(30), reward: RewardDefinitionSchema, prerequisiteMissionIds: z.array(MissionIdSchema).max(2), allowedActionIds: z.array(ChoiceIdSchema).max(12), npcRoles: z.array(NpcIdSchema).min(1).max(3), variants: z.array(MissionVariantSchema).min(1).max(3), hints: z.array(PracticeHintSchema).max(60) }).superRefine((mission, context) => {
  const nodes = new Map(mission.nodes.map((node) => [node.id, node]));
  if (nodes.size !== mission.nodes.length) context.addIssue({ code: 'custom', path: ['nodes'], message: 'Duplicate node ID.' });
  if (!nodes.has(mission.startNode)) context.addIssue({ code: 'custom', path: ['startNode'], message: 'Start node does not exist.' });
  mission.nodes.forEach((node, index) => {
    const transitions = [...node.actionTransitions, ...node.intentTransitions];
    if (transitions.length === 0) context.addIssue({ code: 'custom', path: ['nodes', index], message: 'Every node requires a transition or terminal result.' });
    transitions.forEach((transition) => {
      if (transition.result === 'none' && (!transition.nextNode || !nodes.has(transition.nextNode))) context.addIssue({ code: 'custom', path: ['nodes', index], message: 'Nonterminal transition references a missing node.' });
      if (transition.result !== 'none' && transition.nextNode !== null) context.addIssue({ code: 'custom', path: ['nodes', index], message: 'Terminal transition must have nextNode: null.' });
    });
  });
  for (const hint of mission.hints) if (!nodes.has(hint.nodeId)) context.addIssue({ code: 'custom', path: ['hints'], message: 'Hint references a missing node.' });
  const reachable = new Set<string>();
  const pending = [mission.startNode];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    const node = nodes.get(id);
    if (node) for (const transition of [...node.actionTransitions, ...node.intentTransitions]) if (transition.nextNode !== null) pending.push(transition.nextNode);
  }
  if (mission.nodes.some((node) => !reachable.has(node.id))) context.addIssue({ code: 'custom', path: ['nodes'], message: 'Every node must be reachable from the start.' });
  const terminalReachable = new Set(mission.nodes.filter((node) => [...node.actionTransitions, ...node.intentTransitions].some((transition) => transition.result !== 'none')).map((node) => node.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of mission.nodes) if (!terminalReachable.has(node.id) && [...node.actionTransitions, ...node.intentTransitions].some((transition) => transition.nextNode !== null && terminalReachable.has(transition.nextNode))) { terminalReachable.add(node.id); changed = true; }
  }
  if (terminalReachable.size !== nodes.size) context.addIssue({ code: 'custom', path: ['nodes'], message: 'Every node must have a path to a terminal result.' });
});
export type MissionDefinition = z.infer<typeof MissionDefinitionSchema>;
export type MissionNode = z.infer<typeof MissionNodeSchema>;
export type ActionTransition = z.infer<typeof ActionTransitionSchema>;
export type IntentTransition = z.infer<typeof IntentTransitionSchema>;
/** Role definition. Instances (anchors) supply position and may override nameZh from the reviewed name list. */
export const NpcDefinitionSchema = z.strictObject({ id: NpcIdSchema, nameZh: shortText, persona: z.string().min(1).max(500), initialPatience: z.number().int().min(0).max(5), voiceKey: NpcIdSchema, allowedIntents: z.array(IntentSchema).min(1).max(10) });
export type NpcDefinition = z.infer<typeof NpcDefinitionSchema>;
export const CueDefinitionSchema = z.strictObject({ id: CueIdSchema, missionId: MissionIdSchema, kind: z.literal('sign'), label: shortText, textZh: z.string().min(1).max(500), englishMeaning: shortText, pinyin: z.string().max(500).optional(), factSnapshotId: identifier, review: z.enum(['pending', 'reviewed']) });
export type CueDefinition = z.infer<typeof CueDefinitionSchema>;

export const EvidenceRecordSchema = z.strictObject({ id: identifier, attemptId: identifier, missionId: MissionIdSchema, track: TrackSchema, cueId: CueIdSchema.optional(), turnId: identifier.optional(), score: z.union([z.literal(0), z.literal(0.5), z.literal(1)]), independent: z.boolean(), firstAttempt: z.boolean(), validationMode: z.boolean(), conversationSource: ConversationSourceSchema.optional(), listeningAssisted: z.boolean(), providerFailure: z.boolean() }).superRefine((evidence, context) => {
  if (evidence.independent && (evidence.listeningAssisted || evidence.validationMode || evidence.providerFailure)) context.addIssue({ code: 'custom', path: ['independent'], message: 'Assisted, validation, and failed-provider evidence cannot be independent.' });
  if (evidence.track === 'conversation' && !evidence.conversationSource) context.addIssue({ code: 'custom', path: ['conversationSource'], message: 'Conversation evidence records its actual source.' });
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export const PauseReasonSchema = z.enum(['provider', 'speech', 'transcription', 'confirmation', 'practice-coach']);
export const AUDIO_PHASE_MAX_MS = { recording: 15_000, transcribing: 8_000, confirming: 20_000, playing: 82_000, idle: 0 } as const;
export const AudioOperationSchema = z.strictObject({ id: identifier, attemptId: identifier, kind: z.enum(['recording', 'playback']), phase: AudioPhaseSchema, speechId: identifier.optional(), registeredAtMs: timestamp, phaseStartedAtMs: timestamp, phaseDeadlineMs: timestamp, assetDurationMs: z.number().int().min(1).max(80_000).optional(), finished: z.boolean() }).superRefine((operation, context) => {
  const duration = operation.phaseDeadlineMs - operation.phaseStartedAtMs;
  const max = operation.phase === 'playing' && operation.assetDurationMs !== undefined ? operation.assetDurationMs + 2_000 : AUDIO_PHASE_MAX_MS[operation.phase];
  if (operation.phaseStartedAtMs < operation.registeredAtMs || duration < 0 || duration > max) context.addIssue({ code: 'custom', path: ['phaseDeadlineMs'], message: 'Audio phase deadline must satisfy its nonrenewable phase bound.' });
  if (operation.kind === 'playback' && (!operation.speechId || !operation.assetDurationMs)) context.addIssue({ code: 'custom', path: ['speechId'], message: 'Playback binds a server-issued speech ID and asset duration.' });
  if (operation.kind === 'playback' && !['playing', 'idle'].includes(operation.phase)) context.addIssue({ code: 'custom', path: ['phase'], message: 'Playback operations cannot enter recording phases.' });
  if (operation.kind === 'recording' && operation.phase === 'playing') context.addIssue({ code: 'custom', path: ['phase'], message: 'Recording and playback use separate registered operations.' });
});
export const NpcRuntimeStateSchema = z.strictObject({ patience: z.number().int().min(0).max(5), mood: MoodSchema, history: TurnContextSchema.shape.history, anchorId: identifier.nullable(), repeatCount: count, cooldownRemainingMs: z.number().int().min(0).max(10_000) });
/** Quest categories the city planner biases toward (CITY_GENERATION §8). */
export const QuestCategorySchema = z.enum(['drink-vendor', 'direction-helper', 'hotel-landmark', 'river-viewpoint', 'photo-passerby']);
export type QuestCategory = z.infer<typeof QuestCategorySchema>;
/** Mutable exploration progress; kept apart from terrain manifests so restoring geometry never resets it. */
export const ExplorationStateSchema = z.strictObject({
  activeMs: count, lastActiveAtMs: timestamp,
  visitedChunkKeys: z.array(z.string().max(32)).max(2_000),
  lastEncounter: z.record(QuestCategorySchema, z.strictObject({ activeMs: count, visitedChunks: count })),
});
export type ExplorationState = z.infer<typeof ExplorationStateSchema>;
export const InternalStateSchema = z.strictObject({
  sessionId: identifier, worldId: identifier, version: count, missionId: MissionIdSchema, attemptId: identifier, nodeId: identifier,
  mode: ModeSchema, status: StatusSchema, zoneId: ZoneIdSchema, position: PositionSchema, tier: TierSchema,
  lastMovementAtMs: z.number().int().nonnegative().optional(),
  flags: FlagsSchema, inventory: InventorySchema, purchases: z.array(PurchaseRecordSchema).max(50), xp: count, badges: z.array(identifier).max(10), awardedRewardIds: z.array(identifier).max(100),
  unlockedMissionIds: z.array(MissionIdSchema).min(1).max(3), completedMissionIds: z.array(MissionIdSchema).max(3),
  npcState: z.record(NpcIdSchema, NpcRuntimeStateSchema),
  directions: DirectionsSchema.nullable(), photo: PhotoRequestSchema.nullable(), exploration: ExplorationStateSchema,
  evidence: z.array(EvidenceRecordSchema).max(500), skills: SkillTracksSchema, difficulty: TierSchema, skillUpdatedAttemptIds: z.array(identifier).max(100),
  pauseReasons: z.array(PauseReasonSchema).max(5), audioOperations: z.array(AudioOperationSchema).max(100), activeAudioOperationId: identifier.nullable(),
  pendingTurn: TurnProvenanceRecordSchema.nullable(),
  validationMode: z.boolean(), inputPreference: InputPreferenceSchema, providerStatus: ProviderStatusSchema,
  factSnapshotId: identifier, secretFacts: z.record(identifier, z.string().max(500)), debrief: DebriefSchema.optional(),
}).superRefine((state, context) => {
  if (state.status === 'active' && state.debrief) context.addIssue({ code: 'custom', path: ['debrief'], message: 'Debrief is terminal only.' });
  const active = state.audioOperations.filter((operation) => !operation.finished && operation.phase !== 'idle');
  if (active.length > 1) context.addIssue({ code: 'custom', path: ['audioOperations'], message: 'Only one audio operation may be active.' });
  if (state.activeAudioOperationId !== null && !active.some((operation) => operation.id === state.activeAudioOperationId)) context.addIssue({ code: 'custom', path: ['activeAudioOperationId'], message: 'Active operation must reference an unfinished registered operation.' });
  if (active.length === 1 && state.activeAudioOperationId !== active[0]?.id) context.addIssue({ code: 'custom', path: ['activeAudioOperationId'], message: 'An active operation must be the selected registered operation.' });
  if (state.pendingTurn && (state.pendingTurn.sessionId !== state.sessionId || state.pendingTurn.attemptId !== state.attemptId)) context.addIssue({ code: 'custom', path: ['pendingTurn'], message: 'Pending input belongs to this session and attempt.' });
});
export type InternalState = z.infer<typeof InternalStateSchema>;
export type EngineResult = { state: InternalState; events: GameEvent[]; conversationEnded?: true };
export const CreateGameOptionsSchema = z.strictObject({ sessionId: identifier, worldId: identifier, attemptId: identifier, missionId: MissionIdSchema.default('Q1'), initialTier: z.union([z.literal(0), z.literal(1)]), validationMode: z.boolean().default(false), inputPreference: InputPreferenceSchema.default('voice'), providerStatus: ProviderStatusSchema, spawn: PositionSchema });
export type CreateGameOptions = z.infer<typeof CreateGameOptionsSchema>;
