import { z } from 'zod';

// All boundary numbers are finite. These generous session caps prevent unbounded
// payloads without substituting schema validation for the later engine's rules.
const unit = z.number().finite().min(0).max(1);
const count = z.number().int().min(0).max(1_000_000);
const timestamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const shortText = z.string().min(1).max(240);

export const CONTRACT_VERSION = '1.2' as const;
export const MissionIdSchema = z.enum(['P1', 'P2', 'B1']);
export const ZoneIdSchema = z.enum(['plaza', 'cafe', 'kiosk', 'concourse', 'platform-1', 'platform-2', 'platform-3']);
export const NpcIdSchema = z.enum(['xiaolin', 'achen', 'laozhou']);
export const CueIdSchema = z.enum(['p1.entrance-sign', 'p1.station-directions', 'p2.timetable', 'p2.platform-change', 'b1.destination-board', 'b1.harbor-change']);
export const ChoiceIdSchema = z.enum(['p1.enter-plaza-door', 'p1.try-closed-door', 'p1.pay-cafe', 'p1.go-kiosk', 'p1.pay-kiosk', 'p2.board-1', 'p2.board-2', 'p2.board-3', 'b1.pay-ticket', 'b1.board-1', 'b1.board-2', 'b1.board-3']);
export const IntentSchema = z.enum(['order_drink', 'accept_substitute', 'cancel_order', 'confirm_drink_price', 'ask_direction', 'confirm_platform', 'request_repeat', 'buy_ticket', 'confirm_ticket', 'greeting', 'unknown']);
export const GameActionTypeSchema = z.enum(['moveZone', 'inspect', 'playCue', 'finishCue', 'audioPhase', 'choose', 'useItem', 'pausePractice', 'resumePractice', 'setInputPreference', 'retryMission', 'startMission']);
export const DESTINATION_ALIASES = {
  jiangbin: ['江滨', '江濱', 'Jiangbin', 'Riverside'],
  haigang: ['海港', 'Haigang', 'Harbor'],
  airport: ['机场', '機場', 'Airport'],
} as const;
export const MANDARIN_NUMERAL_ALIASES = { '1': ['1', '一', '壹'], '2': ['2', '二', '两', '贰'], '3': ['3', '三', '叁'] } as const;
export const ModeSchema = z.enum(['practice', 'boss']);
export const TrackSchema = z.enum(['reading', 'listening', 'conversation', 'repair']);
export const ItemSchema = z.enum(['hint', 'freeze']);
export const TierSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const InputPreferenceSchema = z.enum(['voice', 'typed-accessibility']);
export const InputSourceSchema = z.enum(['typed', 'stt', 'stt-edited']);
export const ConversationSourceSchema = z.enum(['spoken', 'typed', 'edited']);
export const CueChannelSchema = z.enum(['audio', 'subtitles', 'validation-text']);
export const AudioPhaseSchema = z.enum(['recording', 'transcribing', 'confirming', 'playing', 'idle']);
export const StatusSchema = z.enum(['active', 'cleared', 'failed']);
export const MoodSchema = z.enum(['warm', 'neutral', 'terse', 'disengaged']);
export const ProviderStatusSchema = z.enum(['live', 'degraded', 'fixture']);
export const PositionSchema = z.strictObject({ x: z.number().finite().min(-20).max(20), z: z.number().finite().min(-20).max(20) });
export const GradeSchema = z.strictObject({ score: unit, confidence: unit });
export const InteractableIdSchema = z.union([NpcIdSchema, CueIdSchema, ChoiceIdSchema]);

export type MissionId = z.infer<typeof MissionIdSchema>;
export type ZoneId = z.infer<typeof ZoneIdSchema>;
export type NpcId = z.infer<typeof NpcIdSchema>;
export type CueId = z.infer<typeof CueIdSchema>;
export type ChoiceId = z.infer<typeof ChoiceIdSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type GameActionType = z.infer<typeof GameActionTypeSchema>;
export type Mode = z.infer<typeof ModeSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Grade = z.infer<typeof GradeSchema>;
export type InputPreference = z.infer<typeof InputPreferenceSchema>;
export type InputSource = z.infer<typeof InputSourceSchema>;
export type AudioPhase = z.infer<typeof AudioPhaseSchema>;

export const GameActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('moveZone'), zoneId: ZoneIdSchema, position: PositionSchema.optional() }),
  z.strictObject({ type: z.literal('inspect'), targetId: InteractableIdSchema }),
  z.strictObject({ type: z.literal('playCue'), cueId: CueIdSchema, channel: CueChannelSchema }),
  z.strictObject({ type: z.literal('finishCue'), playbackId: identifier }),
  z.strictObject({ type: z.literal('audioPhase'), operationId: identifier, phase: AudioPhaseSchema }),
  z.strictObject({ type: z.literal('choose'), choiceId: ChoiceIdSchema }),
  z.strictObject({ type: z.literal('useItem'), item: ItemSchema }),
  z.strictObject({ type: z.literal('pausePractice') }),
  z.strictObject({ type: z.literal('resumePractice') }),
  z.strictObject({ type: z.literal('setInputPreference'), preference: InputPreferenceSchema }),
  z.strictObject({ type: z.literal('retryMission') }),
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
export const TurnRequestSchema = z.strictObject({ turnId: identifier, expectedVersion: count, npcId: NpcIdSchema, input: TurnInputSchema });
export type TurnRequest = z.infer<typeof TurnRequestSchema>;
export const CreateSessionRequestSchema = z.strictObject({ initialTier: z.union([z.literal(0), z.literal(1)]), providerMode: z.enum(['live', 'fixture']), validationMode: z.boolean().default(false), inputPreference: InputPreferenceSchema.default('voice') });
export type CreateSessionRequest = z.input<typeof CreateSessionRequestSchema>;

export const SkillTrackSchema = z.strictObject({ mastery: unit, independentCount: count });
export const SkillTracksSchema = z.strictObject({ reading: SkillTrackSchema, listening: SkillTrackSchema, conversation: SkillTrackSchema, repair: SkillTrackSchema });
export const EvidenceSummarySchema = z.strictObject({ spokenTurns: count, typedTurns: count, editedTurns: count, independentListening: count, assistedListening: count });
export const DebriefSchema = z.strictObject({ tracks: SkillTracksSchema, strengths: z.array(shortText).max(4), improvement: shortText, nextPracticeReason: shortText, evidenceSummary: EvidenceSummarySchema });
export type Debrief = z.infer<typeof DebriefSchema>;
export const InventorySchema = z.strictObject({ hint: z.number().int().min(0).max(3), freeze: z.number().int().min(0).max(3) });
export const PublicStateSchema = z.strictObject({
  sessionId: identifier, version: count, missionId: MissionIdSchema, mode: ModeSchema,
  status: StatusSchema, zoneId: ZoneIdSchema, tier: TierSchema,
  objectives: z.array(z.strictObject({ id: identifier, label: shortText, complete: z.boolean() })).max(20),
  interactables: z.array(z.strictObject({ id: InteractableIdSchema, kind: z.enum(['npc', 'sign', 'pa', 'choice']), label: shortText, position: PositionSchema })).max(40),
  visibleCues: z.array(z.strictObject({ id: CueIdSchema, label: shortText, text: z.string().max(500).optional(), audioAssetId: identifier.optional() })).max(12),
  npcMood: z.record(NpcIdSchema, MoodSchema), inventory: InventorySchema,
  xp: count, badges: z.array(identifier).max(10),
  timer: z.strictObject({ remainingMs: z.number().int().min(0).max(180_000), running: z.boolean(), syncedAtMs: timestamp }).nullable(),
  capabilities: z.strictObject({ coach: z.boolean(), hints: z.boolean(), freeze: z.boolean() }),
  validationMode: z.boolean(), inputPreference: InputPreferenceSchema, providerStatus: ProviderStatusSchema,
  debrief: DebriefSchema.optional(),
}).superRefine((state, context) => {
  if ((state.missionId === 'B1') !== (state.mode === 'boss')) context.addIssue({ code: 'custom', path: ['mode'], message: 'B1 is boss; P1/P2 are practice.' });
  if (state.mode === 'boss' && state.tier !== 1) context.addIssue({ code: 'custom', path: ['tier'], message: 'Boss difficulty is fixed at tier 1.' });
  if (state.status === 'active' && state.debrief) context.addIssue({ code: 'custom', path: ['debrief'], message: 'Debrief exists only after an attempt ends.' });
  if (state.mode === 'boss' && Object.values(state.capabilities).some(Boolean)) context.addIssue({ code: 'custom', path: ['capabilities'], message: 'Boss disables coaching, hints, and freeze.' });
  for (const [field, values] of [['objectives', state.objectives], ['interactables', state.interactables], ['visibleCues', state.visibleCues]] as const) {
    if (new Set(values.map((value) => value.id)).size !== values.length) context.addIssue({ code: 'custom', path: [field], message: 'IDs must be unique.' });
  }
});
export type PublicState = z.infer<typeof PublicStateSchema>;
export const CoachFeedbackSchema = z.strictObject({ understood: shortText, explanation: shortText, improvedExample: shortText });
export type CoachFeedback = z.infer<typeof CoachFeedbackSchema>;
export const GameEventSchema = z.strictObject({ id: identifier, kind: z.enum(['objective', 'reward', 'result']), message: shortText });
export type GameEvent = z.infer<typeof GameEventSchema>;
export const ActionResponseSchema = z.strictObject({ state: PublicStateSchema, events: z.array(GameEventSchema).max(20) });
export type ActionResponse = z.infer<typeof ActionResponseSchema>;
export const StateResponseSchema = z.strictObject({ state: PublicStateSchema });
export type StateResponse = z.infer<typeof StateResponseSchema>;
export const TurnResponseSchema = z.strictObject({ turnId: identifier, state: PublicStateSchema, events: z.array(GameEventSchema).max(20), npcReply: z.string().min(1).max(80), speechId: identifier.optional(), feedback: CoachFeedbackSchema.optional(), vibe: z.strictObject({ intent: unit, clarity: unit, courtesy: unit }).optional() }).superRefine((response, context) => {
  if (response.state.mode === 'boss' && response.state.status === 'active') {
    if (response.feedback !== undefined) context.addIssue({ code: 'custom', path: ['feedback'], message: 'Active boss response omits coaching.' });
    if (response.vibe !== undefined) context.addIssue({ code: 'custom', path: ['vibe'], message: 'Active boss response omits evaluation scores.' });
  }
});
export type TurnResponse = z.infer<typeof TurnResponseSchema>;

export const SlotSchema = z.discriminatedUnion('key', [
  z.strictObject({ key: z.literal('drink'), value: z.enum(['coffee', 'tea', 'water']) }),
  z.strictObject({ key: z.literal('destination'), value: z.enum(['jiangbin', 'haigang', 'airport']) }),
  z.strictObject({ key: z.literal('platform'), value: z.enum(['1', '2', '3']) }),
  z.strictObject({ key: z.literal('quantity'), value: z.literal('1') }),
  z.strictObject({ key: z.literal('priceCny'), value: z.number().int().min(0).max(1000) }),
]);
export type Slot = z.infer<typeof SlotSchema>;
export const INTENT_SLOT_KEYS: Record<Intent, readonly Slot['key'][]> = {
  order_drink: ['drink'], accept_substitute: ['drink'], cancel_order: [], confirm_drink_price: ['drink', 'priceCny'], ask_direction: ['destination'],
  confirm_platform: ['platform'], request_repeat: [], buy_ticket: ['destination', 'quantity'], confirm_ticket: ['destination', 'quantity'], greeting: [], unknown: [],
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
    if (['buy_ticket', 'confirm_ticket'].includes(evaluation.intent) && slot.key === 'destination' && slot.value !== 'haigang') context.addIssue({ code: 'custom', path: ['slots', index], message: 'The authored ticket destination is Haigang.' });
  });
});
export type TurnEvaluation = z.infer<typeof TurnEvaluationSchema>;
export const TurnContextSchema = z.strictObject({ missionId: MissionIdSchema, mode: ModeSchema, tier: TierSchema, npcId: NpcIdSchema, persona: z.string().min(1).max(500), patience: z.number().int().min(0).max(5), allowedIntents: z.array(IntentSchema).min(1).max(11), facts: z.record(identifier, z.string().max(500)), history: z.array(z.strictObject({ role: z.enum(['player', 'npc']), text: z.string().max(500) })).max(12) });
export type TurnContext = z.infer<typeof TurnContextSchema>;
export interface DialogueProvider { evaluate(context: TurnContext, playerText: string): Promise<TurnEvaluation> }
export interface SpeechProvider { synthesize(text: string, voiceKey: string): Promise<Uint8Array>; transcribe(audio: Uint8Array, mimeType: string): Promise<string> }

// Context-dependent validation stays reusable for the provider owner. This is
// validation only: confidence thresholds and progression belong to Segment-001.
export function validateEvaluationForContext(value: unknown, context: TurnContext, playerText: string): TurnEvaluation {
  const evaluation = TurnEvaluationSchema.parse(value);
  const validatedContext = TurnContextSchema.parse(context);
  if (!validatedContext.allowedIntents.includes(evaluation.intent) && evaluation.intent !== 'unknown') throw new Error('Evaluation intent is not allowed in the active scene.');
  if (!playerText.includes(evaluation.evidenceQuote)) throw new Error('Evaluation evidence is not a substring of player input.');
  if (evaluation.interaction === 'relevant' && evaluation.intent !== 'unknown' && !evaluation.evidenceQuote.trim()) throw new Error('Relevant evaluations require supporting evidence.');
  if (validatedContext.mode === 'boss' && evaluation.coach !== null) throw new Error('Boss evaluator output must use coach: null.');
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
// Set by the server after checking its transcription record. The fixed engine
// evaluation signature reads this private metadata; public evaluation does not
// gain the ability to claim microphone use or independent skill evidence.
export const TurnProvenanceRecordSchema = z.strictObject({ turnId: identifier, sessionId: identifier, attemptId: identifier, npcId: NpcIdSchema, text: PlayerTextSchema, source: InputSourceSchema, transcriptionId: identifier.optional(), originalSttText: PlayerTextSchema.optional(), assisted: z.boolean(), createdAtMs: timestamp }).superRefine((record, context) => {
  if (record.source !== 'typed' && (!record.transcriptionId || !record.originalSttText)) context.addIssue({ code: 'custom', path: ['transcriptionId'], message: 'Verified STT provenance requires the server record and original text.' });
  if (record.source === 'stt' && record.text !== record.originalSttText) context.addIssue({ code: 'custom', path: ['source'], message: 'Only unchanged server-verified STT can be marked stt.' });
  if (record.source === 'stt-edited' && record.text === record.originalSttText) context.addIssue({ code: 'custom', path: ['source'], message: 'Edited STT must differ from the original.' });
  if (record.source === 'typed' && (record.transcriptionId || record.originalSttText)) context.addIssue({ code: 'custom', path: ['source'], message: 'Typed provenance contains no claimed STT record.' });
});
export type TurnProvenanceRecord = z.infer<typeof TurnProvenanceRecordSchema>;

export type RendererProps = { state: PublicState; onAction: (action: GameAction) => Promise<void>; onTalk: (npcId: string) => void };
export type WorldRendererProps = RendererProps;
export type ValidationHarnessProps = RendererProps;
export type SkillDebriefProps = { state: PublicState };
export type AudioControllerProps = { state: PublicState; onAction: RendererProps['onAction']; speechId?: string };
export type RecorderProps = { state: PublicState; npcId: NpcId; onAction: RendererProps['onAction']; onTranscript: (transcription: TranscriptionResponse) => void };

export const FlagIdSchema = z.string().regex(/^(p1|p2|b1|session)\.[a-z][a-z0-9-]{0,63}$/);
export const FlagValueSchema = z.union([z.boolean(), z.string().max(120), z.number().finite().min(0).max(1_000_000)]);
export const FlagsSchema = z.record(FlagIdSchema, FlagValueSchema);
export const ResultSchema = z.enum(['none', 'clear', 'fail']);
export const GuardSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('flagEquals'), flag: FlagIdSchema, value: FlagValueSchema }),
  z.strictObject({ op: z.literal('flagExists'), flag: FlagIdSchema }),
  z.strictObject({ op: z.literal('itemAtLeast'), item: ItemSchema, quantity: z.number().int().min(0).max(3) }),
  z.strictObject({ op: z.literal('zoneIs'), zoneId: ZoneIdSchema }),
  z.strictObject({ op: z.literal('cueDelivered'), cueId: CueIdSchema }),
  z.strictObject({ op: z.literal('timeRemainingAbove'), remainingMs: z.number().int().min(0).max(180_000) }),
]);
export type Guard = z.infer<typeof GuardSchema>;
const transitionFields = { requiredFlags: z.record(FlagIdSchema, FlagValueSchema), guards: z.array(GuardSchema).max(20), setFlags: FlagsSchema, nextNode: identifier.nullable(), result: ResultSchema };
export const ActionTransitionSchema = z.strictObject({ trigger: GameActionSchema, ...transitionFields });
export const IntentTransitionSchema = z.strictObject({ trigger: z.strictObject({ intent: IntentSchema, slots: z.array(SlotSchema).max(2) }), ...transitionFields });
export const MissionNodeSchema = z.strictObject({ id: identifier, objective: shortText, actionTransitions: z.array(ActionTransitionSchema).max(30), intentTransitions: z.array(IntentTransitionSchema).max(20), checkpoint: z.boolean().default(false) });
export const RewardDefinitionSchema = z.strictObject({ id: identifier, xp: z.number().int().min(0).max(150), items: InventorySchema, badge: z.literal('station-navigator').optional(), independentRepairXp: z.union([z.literal(0), z.literal(20)]) });
export const FactSnapshotSchema = z.strictObject({ id: identifier, facts: z.record(identifier, z.string().max(500)) });
export const PracticeHintSchema = z.strictObject({ id: identifier, nodeId: identifier, level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: shortText, exampleZh: z.string().max(80).optional(), pinyin: z.string().max(240).optional() });
export const MissionVariantSchema = z.strictObject({ tier: TierSchema, factSnapshots: z.array(FactSnapshotSchema).min(1).max(10), targetTracks: z.array(TrackSchema).min(1).max(4), cueIds: z.array(CueIdSchema).max(12) });
export const MissionDefinitionSchema = z.strictObject({ id: MissionIdSchema, mode: ModeSchema, startNode: identifier, nodes: z.array(MissionNodeSchema).min(1).max(30), reward: RewardDefinitionSchema, prerequisiteMissionIds: z.array(MissionIdSchema).max(2), allowedActionIds: z.array(ChoiceIdSchema).max(12), variants: z.array(MissionVariantSchema).min(1).max(3), hints: z.array(PracticeHintSchema).max(60), activeTimerMs: z.union([z.literal(120_000), z.literal(180_000)]).nullable() }).superRefine((mission, context) => {
  if ((mission.id === 'B1') !== (mission.mode === 'boss')) context.addIssue({ code: 'custom', path: ['mode'], message: 'Mission ID and mode disagree.' });
  if (mission.mode === 'boss' && (mission.hints.length > 0 || mission.variants.some((variant) => variant.tier !== 1))) context.addIssue({ code: 'custom', path: ['variants'], message: 'Boss has one fixed tier and no coaching hints.' });
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
export type RewardDefinition = z.infer<typeof RewardDefinitionSchema>;
export const NpcDefinitionSchema = z.strictObject({ id: NpcIdSchema, nameZh: shortText, persona: z.string().min(1).max(500), initialPatience: z.number().int().min(0).max(5), zoneId: ZoneIdSchema, position: PositionSchema, voiceKey: NpcIdSchema, allowedIntents: z.array(IntentSchema).min(1).max(11) });
export type NpcDefinition = z.infer<typeof NpcDefinitionSchema>;
export const CueDefinitionSchema = z.strictObject({ id: CueIdSchema, missionId: MissionIdSchema, kind: z.enum(['sign', 'pa', 'directions']), label: shortText, zoneId: ZoneIdSchema, position: PositionSchema, textZh: z.string().min(1).max(500), englishMeaning: shortText, pinyin: z.string().max(500).optional(), audioAssetId: identifier.optional(), factSnapshotId: identifier, review: z.enum(['pending', 'reviewed']), variants: z.array(z.strictObject({ tier: TierSchema, textZh: z.string().min(1).max(500), englishMeaning: shortText, audioAssetId: identifier.optional() })).max(3) });
export type CueDefinition = z.infer<typeof CueDefinitionSchema>;

export const EvidenceRecordSchema = z.strictObject({ id: identifier, attemptId: identifier, missionId: MissionIdSchema, track: TrackSchema, cueId: CueIdSchema.optional(), turnId: identifier.optional(), score: z.union([z.literal(0), z.literal(0.5), z.literal(1)]), independent: z.boolean(), firstAttempt: z.boolean(), validationMode: z.boolean(), conversationSource: ConversationSourceSchema.optional(), listeningAssisted: z.boolean(), providerFailure: z.boolean() }).superRefine((evidence, context) => {
  if (evidence.independent && (evidence.listeningAssisted || evidence.validationMode || evidence.providerFailure)) context.addIssue({ code: 'custom', path: ['independent'], message: 'Assisted, validation, and failed-provider evidence cannot be independent.' });
  if (evidence.track === 'conversation' && !evidence.conversationSource) context.addIssue({ code: 'custom', path: ['conversationSource'], message: 'Conversation evidence records its actual source.' });
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export const PauseReasonSchema = z.enum(['provider', 'speech', 'pa', 'transcription', 'confirmation', 'practice-coach', 'freeze']);
export const AUDIO_PHASE_MAX_MS = { recording: 15_000, transcribing: 8_000, confirming: 20_000, playing: 82_000, idle: 0 } as const;
export const AudioOperationSchema = z.strictObject({ id: identifier, attemptId: identifier, kind: z.enum(['recording', 'playback']), phase: AudioPhaseSchema, speechId: identifier.optional(), registeredAtMs: timestamp, phaseStartedAtMs: timestamp, phaseDeadlineMs: timestamp, assetDurationMs: z.number().int().min(1).max(80_000).optional(), finished: z.boolean() }).superRefine((operation, context) => {
  const duration = operation.phaseDeadlineMs - operation.phaseStartedAtMs;
  const max = operation.phase === 'playing' && operation.assetDurationMs !== undefined ? operation.assetDurationMs + 2_000 : AUDIO_PHASE_MAX_MS[operation.phase];
  if (operation.phaseStartedAtMs < operation.registeredAtMs || duration < 0 || duration > max) context.addIssue({ code: 'custom', path: ['phaseDeadlineMs'], message: 'Audio phase deadline must satisfy its nonrenewable phase bound.' });
  if (operation.kind === 'playback' && (!operation.speechId || !operation.assetDurationMs)) context.addIssue({ code: 'custom', path: ['speechId'], message: 'Playback binds a server-issued speech ID and asset duration.' });
  if (operation.kind === 'playback' && !['playing', 'idle'].includes(operation.phase)) context.addIssue({ code: 'custom', path: ['phase'], message: 'Playback operations cannot enter recording phases.' });
  if (operation.kind === 'recording' && operation.phase === 'playing') context.addIssue({ code: 'custom', path: ['phase'], message: 'Recording and playback use separate registered operations.' });
});
export type AudioOperation = z.infer<typeof AudioOperationSchema>;
export const CuePlaybackRecordSchema = z.strictObject({ id: identifier, attemptId: identifier, cueId: CueIdSchema, channel: CueChannelSchema, startedAtMs: timestamp, deadlineMs: timestamp, delivered: z.boolean(), interrupted: z.boolean(), listeningAssisted: z.boolean() }).superRefine((record, context) => {
  if (record.deadlineMs < record.startedAtMs || record.deadlineMs - record.startedAtMs > 82_000) context.addIssue({ code: 'custom', path: ['deadlineMs'], message: 'PA playback is bounded by asset duration plus two seconds.' });
  if (record.channel !== 'audio' && !record.listeningAssisted) context.addIssue({ code: 'custom', path: ['listeningAssisted'], message: 'Subtitle and validation transcripts are assisted.' });
  if (record.interrupted && record.delivered) context.addIssue({ code: 'custom', path: ['delivered'], message: 'Interrupted playback cannot certify full delivery.' });
});
export type CuePlaybackRecord = z.infer<typeof CuePlaybackRecordSchema>;
export const NpcRuntimeStateSchema = z.strictObject({ patience: z.number().int().min(0).max(5), mood: MoodSchema, history: TurnContextSchema.shape.history, revealedFactIds: z.array(identifier).max(30), repeatCounts: z.partialRecord(CueIdSchema, count), cooldownRemainingMs: z.number().int().min(0).max(10_000) });
export const TimerStateSchema = z.strictObject({ initialMs: z.number().int().min(0).max(180_000), remainingMs: z.number().int().min(0).max(180_000), lastUpdatedAtMs: timestamp, pauseReasons: z.array(PauseReasonSchema).max(7), freezeRemainingMs: z.number().int().min(0).max(20_000) });
export const InternalStateSchema = z.strictObject({
  sessionId: identifier, version: count, missionId: MissionIdSchema, attemptId: identifier, nodeId: identifier,
  mode: ModeSchema, status: StatusSchema, zoneId: ZoneIdSchema, position: PositionSchema, tier: TierSchema,
  lastMovementAtMs: z.number().int().nonnegative().optional(),
  flags: FlagsSchema, inventory: InventorySchema, xp: count, badges: z.array(identifier).max(10), awardedRewardIds: z.array(identifier).max(100), unlockedMissionIds: z.array(MissionIdSchema).min(1).max(3),
  inspectedTargetIds: z.array(InteractableIdSchema).max(40), cuePlaybacks: z.array(CuePlaybackRecordSchema).max(100), npcState: z.record(NpcIdSchema, NpcRuntimeStateSchema),
  evidence: z.array(EvidenceRecordSchema).max(500), skills: SkillTracksSchema, difficulty: TierSchema, skillUpdatedAttemptIds: z.array(identifier).max(100),
  timer: TimerStateSchema.nullable(), audioOperations: z.array(AudioOperationSchema).max(100), activeAudioOperationId: identifier.nullable(),
  pendingTurn: TurnProvenanceRecordSchema.nullable(),
  validationMode: z.boolean(), inputPreference: InputPreferenceSchema, providerStatus: ProviderStatusSchema,
  factSnapshotId: identifier, secretFacts: z.record(identifier, z.string().max(500)), debrief: DebriefSchema.optional(),
}).superRefine((state, context) => {
  if ((state.missionId === 'B1') !== (state.mode === 'boss')) context.addIssue({ code: 'custom', path: ['mode'], message: 'Mission ID and mode disagree.' });
  if (state.mode === 'boss' && state.tier !== 1) context.addIssue({ code: 'custom', path: ['tier'], message: 'Boss uses tier 1.' });
  if (state.status === 'active' && state.debrief) context.addIssue({ code: 'custom', path: ['debrief'], message: 'Debrief is terminal only.' });
  const active = state.audioOperations.filter((operation) => !operation.finished && operation.phase !== 'idle');
  if (active.length > 1) context.addIssue({ code: 'custom', path: ['audioOperations'], message: 'Only one audio operation may be active.' });
  if (state.activeAudioOperationId !== null && !active.some((operation) => operation.id === state.activeAudioOperationId)) context.addIssue({ code: 'custom', path: ['activeAudioOperationId'], message: 'Active operation must reference an unfinished registered operation.' });
  if (active.length === 1 && state.activeAudioOperationId !== active[0]?.id) context.addIssue({ code: 'custom', path: ['activeAudioOperationId'], message: 'An active operation must be the selected registered operation.' });
  if (state.pendingTurn && (state.pendingTurn.sessionId !== state.sessionId || state.pendingTurn.attemptId !== state.attemptId)) context.addIssue({ code: 'custom', path: ['pendingTurn'], message: 'Pending input belongs to this session and attempt.' });
  if (state.mode === 'boss' && state.timer?.pauseReasons.some((reason) => reason === 'practice-coach' || reason === 'freeze')) context.addIssue({ code: 'custom', path: ['timer', 'pauseReasons'], message: 'Boss cannot use practice pauses.' });
});
export type InternalState = z.infer<typeof InternalStateSchema>;
export type EngineResult = { state: InternalState; events: GameEvent[] };
export const CreateGameOptionsSchema = z.strictObject({ sessionId: identifier, attemptId: identifier, missionId: MissionIdSchema.default('P1'), initialTier: z.union([z.literal(0), z.literal(1)]), validationMode: z.boolean().default(false), inputPreference: InputPreferenceSchema.default('voice'), providerStatus: ProviderStatusSchema });
export type CreateGameOptions = z.infer<typeof CreateGameOptionsSchema>;

export const BoundsSchema = z.strictObject({ minX: z.number().finite().min(-20).max(20), maxX: z.number().finite().min(-20).max(20), minZ: z.number().finite().min(-20).max(20), maxZ: z.number().finite().min(-20).max(20) }).refine((bounds) => bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ, 'Bounds require positive width and depth.');
export const ColliderSchema = z.strictObject({ id: identifier, bounds: BoundsSchema });
export const SceneManifestSchema = z.strictObject({ bounds: BoundsSchema, spawn: PositionSchema, movementSpeed: z.literal(4), interactionRadius: z.literal(2), playerRadius: z.number().finite().min(0.1).max(0.75), zones: z.array(z.strictObject({ id: ZoneIdSchema, center: PositionSchema, bounds: BoundsSchema })).length(7), colliders: z.array(ColliderSchema).max(40), interactables: z.array(z.strictObject({ id: InteractableIdSchema, zoneId: ZoneIdSchema, kind: z.enum(['npc', 'sign', 'pa', 'choice']), label: shortText, position: PositionSchema })).max(40) }).superRefine((scene, context) => {
  if (new Set(scene.zones.map((zone) => zone.id)).size !== 7) context.addIssue({ code: 'custom', path: ['zones'], message: 'All seven zones appear exactly once.' });
  if (new Set(scene.interactables.map((target) => target.id)).size !== scene.interactables.length) context.addIssue({ code: 'custom', path: ['interactables'], message: 'Interactable IDs are unique.' });
});
export type SceneManifest = z.infer<typeof SceneManifestSchema>;
