import {
  ActionRequestSchema, ActionResponseSchema, InternalStateSchema, PublicStateSchema, TranscriptionRecordSchema,
  TranscriptionResponseSchema, TurnContextSchema, TurnEvaluationSchema, TurnProvenanceRecordSchema, TurnRequestSchema, TurnResponseSchema,
  type MissionId, type PublicState,
} from './contracts.js';
import { sceneManifest } from './content/scene-manifest.js';

export const BASELINE_NOW_MS = 1_791_653_400_000;

// This is a presentation/contract fixture, never an implemented campaign. Every
// mission remains active, without achievements, provider calls, or progression.
export function createBaselineState(missionId: MissionId = 'P1'): PublicState {
  const boss = missionId === 'B1';
  const prefix = missionId.toLowerCase();
  return PublicStateSchema.parse({
    sessionId: 'fixture-session', version: 0, missionId, mode: boss ? 'boss' : 'practice',
    status: 'active', zoneId: missionId === 'P1' ? 'plaza' : 'concourse', tier: 1,
    objectives: [{ id: `${prefix}.bootstrap`, label: 'Mission unimplemented — build Segment-001', complete: false }],
    interactables: sceneManifest.interactables.filter((target) => ['xiaolin', 'achen', 'laozhou'].includes(target.id) || target.id.startsWith(`${prefix}.`)).map(({ id, kind, label, position }) => ({ id, kind, label, position })),
    visibleCues: [], npcMood: { xiaolin: 'warm', achen: 'warm', laozhou: 'neutral' },
    inventory: { hint: 0, freeze: 0 }, xp: 0, badges: [],
    timer: missionId === 'P1' ? null : { remainingMs: boss ? 180_000 : 120_000, running: false, syncedAtMs: BASELINE_NOW_MS },
    capabilities: { coach: !boss, hints: !boss, freeze: !boss },
    validationMode: true, inputPreference: 'voice', providerStatus: 'fixture',
  });
}

export const baselineStates = { P1: createBaselineState('P1'), P2: createBaselineState('P2'), B1: createBaselineState('B1') };
export const baselineActionRequest = ActionRequestSchema.parse({ actionId: 'fixture-action-001', expectedVersion: 0, action: { type: 'inspect', targetId: 'p1.entrance-sign' } });
export const baselineActionResponse = ActionResponseSchema.parse({ state: createBaselineState(), events: [] });
export const baselineTurnRequest = TurnRequestSchema.parse({ turnId: 'fixture-turn-001', expectedVersion: 0, npcId: 'xiaolin', input: { text: '请给我一杯茶。', source: 'stt', transcriptionId: 'fixture-transcription-001' } });
export const baselinePracticeTurnResponse = TurnResponseSchema.parse({ turnId: 'fixture-turn-001', state: createBaselineState(), events: [], npcReply: '好的，一杯茶十元。', speechId: 'fixture-speech-001', feedback: { understood: 'You asked for tea.', explanation: 'Your request was clear.', improvedExample: '请给我一杯茶，谢谢。' }, vibe: { intent: 0.95, clarity: 0.9, courtesy: 0.9 } });
export const baselineBossTurnResponse = TurnResponseSchema.parse({ turnId: 'fixture-turn-boss', state: createBaselineState('B1'), events: [], npcReply: '一张去海港的票，十五元。', speechId: 'fixture-speech-boss' });
export const baselineTranscription = TranscriptionResponseSchema.parse({ text: '请给我一杯茶。', transcriptionId: 'fixture-transcription-001' });
export const baselineTranscriptionRecord = TranscriptionRecordSchema.parse({ id: baselineTranscription.transcriptionId, sessionId: 'fixture-session', attemptId: 'fixture-attempt-001', originalText: baselineTranscription.text, createdAtMs: BASELINE_NOW_MS, expiresAtMs: BASELINE_NOW_MS + 60_000 });
export const baselineTurnProvenance = TurnProvenanceRecordSchema.parse({ turnId: baselineTurnRequest.turnId, sessionId: baselineTranscriptionRecord.sessionId, attemptId: baselineTranscriptionRecord.attemptId, npcId: baselineTurnRequest.npcId, text: baselineTurnRequest.input.text, source: 'stt', transcriptionId: baselineTranscriptionRecord.id, originalSttText: baselineTranscriptionRecord.originalText, assisted: false, createdAtMs: BASELINE_NOW_MS });
export const baselineTurnContext = TurnContextSchema.parse({ missionId: 'P1', mode: 'practice', tier: 1, npcId: 'xiaolin', persona: 'Warm, encouraging café owner; Mandarin Chinese.', patience: 5, allowedIntents: ['order_drink', 'accept_substitute', 'cancel_order', 'confirm_drink_price', 'greeting', 'request_repeat', 'unknown'], facts: { coffee: 'unavailable', teaPrice: '10 CNY', waterPrice: '5 CNY' }, history: [] });
export const baselineEvaluation = TurnEvaluationSchema.parse({ intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }], evidenceQuote: '一杯茶', intentGrade: { score: 0.95, confidence: 0.95 }, clarity: 0.9, courtesy: 0.9, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '好的，一杯茶十元。', coach: baselinePracticeTurnResponse.feedback ?? null });
export const malformedEvaluation: unknown = { ...baselineEvaluation, slots: [{ key: 'price', value: '999' }], intentGrade: { score: 1.1, confidence: -1 }, replyZh: 'x'.repeat(81) };
export const baselineInternalState = InternalStateSchema.parse({
  sessionId: 'fixture-session', version: 0, missionId: 'P1', attemptId: 'fixture-attempt-001', nodeId: 'p1.bootstrap',
  mode: 'practice', status: 'active', zoneId: 'plaza', position: { ...sceneManifest.spawn }, tier: 1,
  flags: {}, inventory: { hint: 0, freeze: 0 }, xp: 0, badges: [], awardedRewardIds: [], unlockedMissionIds: ['P1'],
  inspectedTargetIds: [], cuePlaybacks: [],
  npcState: {
    xiaolin: { patience: 5, mood: 'warm', history: [], revealedFactIds: [], repeatCounts: {}, cooldownRemainingMs: 0 },
    achen: { patience: 4, mood: 'warm', history: [], revealedFactIds: [], repeatCounts: {}, cooldownRemainingMs: 0 },
    laozhou: { patience: 3, mood: 'neutral', history: [], revealedFactIds: [], repeatCounts: {}, cooldownRemainingMs: 0 },
  },
  evidence: [], skills: { reading: { mastery: 0.4, independentCount: 0 }, listening: { mastery: 0.4, independentCount: 0 }, conversation: { mastery: 0.4, independentCount: 0 }, repair: { mastery: 0.4, independentCount: 0 } },
  difficulty: 1, skillUpdatedAttemptIds: [], timer: null, audioOperations: [], activeAudioOperationId: null, pendingTurn: null,
  validationMode: true, inputPreference: 'voice', providerStatus: 'fixture', factSnapshotId: 'p1.bootstrap', secretFacts: {},
});
