import {
  ActionRequestSchema, ActionResponseSchema, InternalStateSchema, TranscriptionRecordSchema,
  TranscriptionResponseSchema, TurnContextSchema, TurnEvaluationSchema, TurnProvenanceRecordSchema, TurnRequestSchema, TurnResponseSchema,
  type MissionId, type PublicState,
} from './contracts.js';
import type { WorldView } from './city/contracts.js';
import { createGame, projectPublicState } from './engine/index.js';

export const BASELINE_NOW_MS = 1_791_653_400_000;
export const BASELINE_SPAWN = { x: 20, z: 20 } as const;

/** An empty, all-walkable world: presentation/contract fixtures need no city. */
export const emptyWorldView: WorldView = {
  worldId: 'fixture-world', walkable: () => true, committed: () => true, districtAt: () => 'historic',
  anchor: () => undefined, anchorsNear: () => [], directionsToHotel: () => null,
};

/** Presentation fixture (e.g. the welcome-screen preview): an active quest with no progress and no world anchors. */
export function createBaselineState(missionId: MissionId = 'Q1'): PublicState {
  const state = createGame({ sessionId: 'fixture-session', worldId: 'fixture-world', attemptId: 'fixture-attempt-001', missionId, initialTier: 1, validationMode: true, inputPreference: 'voice', providerStatus: 'fixture', spawn: BASELINE_SPAWN }, BASELINE_NOW_MS);
  return projectPublicState(state, BASELINE_NOW_MS, emptyWorldView);
}

export const baselineStates = { Q1: createBaselineState('Q1'), Q2: createBaselineState('Q2'), Q3: createBaselineState('Q3') };
export const baselineActionRequest = ActionRequestSchema.parse({ actionId: 'fixture-action-001', expectedVersion: 0, action: { type: 'setInputPreference', preference: 'typed-accessibility' } });
export const baselineActionResponse = ActionResponseSchema.parse({ state: createBaselineState(), events: [] });
export const baselineTurnRequest = TurnRequestSchema.parse({ turnId: 'fixture-turn-001', expectedVersion: 0, npcId: 'vendor', anchorId: 'fixture-anchor.vendor', input: { text: '请给我一杯茶。', source: 'stt', transcriptionId: 'fixture-transcription-001' } });
export const baselinePracticeTurnResponse = TurnResponseSchema.parse({ turnId: 'fixture-turn-001', state: createBaselineState(), events: [], npcReply: '好嘞，茶十块。', speechId: 'fixture-speech-001', feedback: { understood: 'You asked for tea.', explanation: 'Your request was clear.', improvedExample: '请给我一杯茶，谢谢。' }, vibe: { intent: 0.95, clarity: 0.9, courtesy: 0.9 } });
export const baselineTranscription = TranscriptionResponseSchema.parse({ text: '请给我一杯茶。', transcriptionId: 'fixture-transcription-001' });
export const baselineTranscriptionRecord = TranscriptionRecordSchema.parse({ id: baselineTranscription.transcriptionId, sessionId: 'fixture-session', attemptId: 'fixture-attempt-001', originalText: baselineTranscription.text, createdAtMs: BASELINE_NOW_MS, expiresAtMs: BASELINE_NOW_MS + 60_000 });
export const baselineTurnProvenance = TurnProvenanceRecordSchema.parse({ turnId: baselineTurnRequest.turnId, sessionId: baselineTranscriptionRecord.sessionId, attemptId: baselineTranscriptionRecord.attemptId, npcId: baselineTurnRequest.npcId, anchorId: baselineTurnRequest.anchorId, text: baselineTurnRequest.input.text, source: 'stt', transcriptionId: baselineTranscriptionRecord.id, originalSttText: baselineTranscriptionRecord.originalText, assisted: false, createdAtMs: BASELINE_NOW_MS });
export const baselineTurnContext = TurnContextSchema.parse({ missionId: 'Q1', mode: 'practice', tier: 1, npcId: 'vendor', anchorId: 'fixture-anchor.vendor', nameZh: '老王', persona: 'Warm, encouraging drink vendor; Mandarin Chinese.', patience: 5, allowedIntents: ['order_drink', 'accept_substitute', 'cancel_order', 'confirm_drink_price', 'greeting', 'request_repeat', 'farewell', 'unknown'], facts: { coffee: '卖完了', teaPriceCny: '10', waterPriceCny: '5' }, history: [] });
export const baselineEvaluation = TurnEvaluationSchema.parse({ intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }], evidenceQuote: '一杯茶', intentGrade: { score: 0.95, confidence: 0.95 }, clarity: 0.9, courtesy: 0.9, targetLanguageUse: 'yes', interaction: 'relevant', replyZh: '好的，一杯茶十元。', coach: baselinePracticeTurnResponse.feedback ?? null });
export const malformedEvaluation: unknown = { ...baselineEvaluation, slots: [{ key: 'price', value: '999' }], intentGrade: { score: 1.1, confidence: -1 }, replyZh: 'x'.repeat(81) };
export const baselineInternalState = InternalStateSchema.parse(createGame({ sessionId: 'fixture-session', worldId: 'fixture-world', attemptId: 'fixture-attempt-001', missionId: 'Q1', initialTier: 1, validationMode: true, inputPreference: 'voice', providerStatus: 'fixture', spawn: BASELINE_SPAWN }, BASELINE_NOW_MS));
