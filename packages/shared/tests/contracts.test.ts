import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ActionRequestSchema, ActionResponseSchema, AudioOperationSchema, CreateSessionRequestSchema,
  CuePlaybackRecordSchema, EvidenceRecordSchema, GameActionSchema, InternalStateSchema, MissionDefinitionSchema,
  PublicStateSchema, TranscriptionRecordSchema, TranscriptionResponseSchema, TurnContextSchema,
  TurnEvaluationSchema, TurnProvenanceRecordSchema, TurnRequestSchema, TurnResponseSchema, validateEvaluationForContext,
} from '../src/contracts.js';
import {
  BASELINE_NOW_MS, baselineActionRequest, baselineActionResponse, baselineBossTurnResponse,
  baselineEvaluation, baselineInternalState, baselinePracticeTurnResponse, baselineStates, baselineTranscriptionRecord,
  baselineTurnContext, baselineTurnProvenance, baselineTurnRequest, createBaselineState, malformedEvaluation,
} from '../src/fixtures.js';
import { createGame, SegmentNotImplementedError } from '../src/engine/index.js';

describe('shared contract boundary fixtures', () => {
  it('validates all three missions without inventing completed gameplay', () => {
    for (const state of Object.values(baselineStates)) {
      expect(PublicStateSchema.parse(state)).toEqual(state);
      expect(state.status).toBe('active');
      expect(state.objectives.every((objective) => !objective.complete)).toBe(true);
      expect(state.xp).toBe(0);
      expect(state.badges).toEqual([]);
      expect(state.validationMode).toBe(true);
      expect(state.providerStatus).toBe('fixture');
    }
    const first = createBaselineState();
    first.inventory.hint = 1;
    expect(createBaselineState().inventory.hint).toBe(0);
  });

  it('validates the portable JSON examples used by other accounts', () => {
    const examples = [
      ['action-request.json', ActionRequestSchema], ['action-response.json', ActionResponseSchema],
      ['turn-request.json', TurnRequestSchema], ['practice-turn-response.json', TurnResponseSchema],
      ['boss-turn-response.json', TurnResponseSchema], ['transcription-response.json', TranscriptionResponseSchema],
      ['transcription-record.json', TranscriptionRecordSchema], ['turn-context.json', TurnContextSchema],
      ['turn-provenance-record.json', TurnProvenanceRecordSchema], ['internal-state.json', InternalStateSchema],
      ['valid-evaluation.json', TurnEvaluationSchema],
    ] as const;
    for (const [filename, schema] of examples) {
      const value: unknown = JSON.parse(readFileSync(new URL(`../../../fixtures/baseline/${filename}`, import.meta.url), 'utf8'));
      expect(schema.safeParse(value).success, filename).toBe(true);
    }
    const states: unknown = JSON.parse(readFileSync(new URL('../../../fixtures/baseline/public-states.json', import.meta.url), 'utf8'));
    expect(Object.values(states as Record<string, unknown>).every((state) => PublicStateSchema.safeParse(state).success)).toBe(true);
  });

  it('omits active boss coaching and evaluator data, even when injected by a client', () => {
    expect('feedback' in baselineBossTurnResponse).toBe(false);
    expect('vibe' in baselineBossTurnResponse).toBe(false);
    expect(TurnResponseSchema.safeParse({ ...baselineBossTurnResponse, feedback: baselinePracticeTurnResponse.feedback }).success).toBe(false);
    expect(TurnResponseSchema.safeParse({ ...baselineBossTurnResponse, vibe: { intent: 1, clarity: 1, courtesy: 1 } }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.B1, secretFacts: { destination: 'platform-2' } }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.B1, capabilities: { coach: true, hints: false, freeze: false } }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.B1, tier: 2 }).success).toBe(false);
  });

  it('allows evidence summary only after a mission ends', () => {
    const debrief = {
      tracks: Object.fromEntries(['reading', 'listening', 'conversation', 'repair'].map((track) => [track, { mastery: 0.4, independentCount: 0 }])),
      strengths: [], improvement: 'Try a spoken request.', nextPracticeReason: 'No independent listening evidence yet.',
      evidenceSummary: { spokenTurns: 0, typedTurns: 1, editedTurns: 0, independentListening: 0, assistedListening: 1 },
    };
    expect(PublicStateSchema.safeParse({ ...baselineStates.B1, debrief }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.B1, status: 'cleared', debrief }).success).toBe(true);
  });

  it('rejects nonfinite, overflowing, and duplicate values at boundaries', () => {
    expect(PublicStateSchema.safeParse({ ...baselineStates.P1, xp: Infinity }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.P1, inventory: { hint: 4, freeze: 0 } }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.P1, objectives: [...baselineStates.P1.objectives, ...baselineStates.P1.objectives] }).success).toBe(false);
    expect(ActionRequestSchema.safeParse({ ...baselineActionRequest, expectedVersion: -1 }).success).toBe(false);
    expect(GameActionSchema.safeParse({ type: 'moveZone', zoneId: 'plaza', position: { x: NaN, z: 0 } }).success).toBe(false);
    expect(GameActionSchema.safeParse({ type: 'choose', choiceId: 'p1.win-immediately' }).success).toBe(false);
    expect(ActionResponseSchema.parse(baselineActionResponse).events).toEqual([]);
  });

  it('defaults to voice and explicitly models provenance without trusting it as verification', () => {
    expect(CreateSessionRequestSchema.parse({ initialTier: 1, providerMode: 'fixture' }).inputPreference).toBe('voice');
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '茶', source: 'stt' } }).success).toBe(false);
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '茶', source: 'typed', transcriptionId: 'forged' } }).success).toBe(false);
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '茶', source: 'stt-edited', transcriptionId: 'fixture-transcription-001' } }).success).toBe(true);
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '茶'.repeat(501), source: 'typed' } }).success).toBe(false);
    expect(TranscriptionRecordSchema.safeParse({ ...baselineTranscriptionRecord, expiresAtMs: BASELINE_NOW_MS }).success).toBe(false);
    expect(TurnRequestSchema.parse({ ...baselineTurnRequest, input: { text: ' 茶。 ', source: 'typed' } }).input.text).toBe(' 茶。 ');
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '   ', source: 'typed' } }).success).toBe(false);
    expect(TurnProvenanceRecordSchema.safeParse({ ...baselineTurnProvenance, text: '请给我一杯水。' }).success).toBe(false);
    expect(TurnProvenanceRecordSchema.safeParse({ ...baselineTurnProvenance, text: '请给我一杯水。', source: 'stt-edited' }).success).toBe(true);
    // Matching IDs are not authentication. Segment-005 must check session/attempt
    // ownership and compare text with the server's stored original transcript.
  });

  it('binds internal pending input to the current session/attempt and permits one registered audio operation', () => {
    expect(InternalStateSchema.parse(baselineInternalState).pendingTurn).toBeNull();
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, pendingTurn: baselineTurnProvenance }).success).toBe(true);
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, pendingTurn: { ...baselineTurnProvenance, attemptId: 'abandoned-attempt' } }).success).toBe(false);
    const operation = { id: 'recording-1', attemptId: baselineInternalState.attemptId, kind: 'recording', phase: 'recording', registeredAtMs: BASELINE_NOW_MS, phaseStartedAtMs: BASELINE_NOW_MS, phaseDeadlineMs: BASELINE_NOW_MS + 15_000, finished: false };
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, audioOperations: [operation], activeAudioOperationId: operation.id }).success).toBe(true);
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, audioOperations: [operation], activeAudioOperationId: null }).success).toBe(false);
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, audioOperations: [operation, { ...operation, id: 'recording-2' }], activeAudioOperationId: operation.id }).success).toBe(false);
  });

  it('prevents fabricated pauses and freezes the bounded audio lifecycle enum', () => {
    expect(GameActionSchema.safeParse({ type: 'audioPhase', operationId: 'op-1', phase: 'provider-wait' }).success).toBe(false);
    expect(GameActionSchema.safeParse({ type: 'audioPhase', operationId: 'op-1', phase: 'confirming' }).success).toBe(true);
    expect(GameActionSchema.safeParse({ type: 'playCue', cueId: 'p2.platform-change', channel: 'text-game' }).success).toBe(false);
    const recording = { id: 'op-1', attemptId: 'attempt-1', kind: 'recording', phase: 'recording', registeredAtMs: 1_000, phaseStartedAtMs: 1_000, phaseDeadlineMs: 16_000, finished: false };
    expect(AudioOperationSchema.safeParse(recording).success).toBe(true);
    expect(AudioOperationSchema.safeParse({ ...recording, phaseDeadlineMs: 16_001 }).success).toBe(false);
    const playback = { ...recording, kind: 'playback', phase: 'playing', speechId: 'speech-1', assetDurationMs: 3_000, phaseDeadlineMs: 6_000 };
    expect(AudioOperationSchema.safeParse(playback).success).toBe(true);
    expect(AudioOperationSchema.safeParse({ ...playback, phaseDeadlineMs: 6_001 }).success).toBe(false);
    expect(AudioOperationSchema.safeParse({ ...playback, speechId: undefined }).success).toBe(false);
  });

  it('does not certify listening through transcripts, interrupted audio, or validation', () => {
    const cue = { id: 'pa-1', attemptId: 'attempt-1', cueId: 'p2.platform-change', channel: 'audio', startedAtMs: 1_000, deadlineMs: 6_000, delivered: true, interrupted: false, listeningAssisted: false };
    expect(CuePlaybackRecordSchema.safeParse(cue).success).toBe(true);
    expect(CuePlaybackRecordSchema.safeParse({ ...cue, interrupted: true }).success).toBe(false);
    expect(CuePlaybackRecordSchema.safeParse({ ...cue, channel: 'validation-text' }).success).toBe(false);
    const evidence = { id: 'evidence-1', attemptId: 'attempt-1', missionId: 'P2', track: 'listening', cueId: 'p2.platform-change', score: 1, independent: true, firstAttempt: true, validationMode: false, listeningAssisted: false, providerFailure: false };
    expect(EvidenceRecordSchema.safeParse(evidence).success).toBe(true);
    expect(EvidenceRecordSchema.safeParse({ ...evidence, validationMode: true }).success).toBe(false);
    expect(EvidenceRecordSchema.safeParse({ ...evidence, listeningAssisted: true }).success).toBe(false);
    expect(EvidenceRecordSchema.safeParse({ ...evidence, providerFailure: true }).success).toBe(false);
  });
});

describe('private evaluation validation', () => {
  it('accepts meaningful Mandarin and rejects malformed scores/slots', () => {
    expect(validateEvaluationForContext(baselineEvaluation, baselineTurnContext, baselineTurnRequest.input.text)).toEqual(baselineEvaluation);
    expect(TurnEvaluationSchema.safeParse(malformedEvaluation).success).toBe(false);
    expect(TurnEvaluationSchema.safeParse({ ...baselineEvaluation, slots: [{ key: 'drink', value: 'tea' }, { key: 'drink', value: 'water' }] }).success).toBe(false);
    expect(TurnEvaluationSchema.safeParse({ ...baselineEvaluation, intent: 'greeting' }).success).toBe(false);
    expect(TurnEvaluationSchema.safeParse({ ...baselineEvaluation, intent: 'accept_substitute', slots: [{ key: 'drink', value: 'coffee' }] }).success).toBe(false);
  });

  it('checks active-scene intents and evidence against the actual player text', () => {
    expect(() => validateEvaluationForContext({ ...baselineEvaluation, intent: 'confirm_platform', slots: [{ key: 'platform', value: '3' }] }, baselineTurnContext, baselineTurnRequest.input.text)).toThrow('active scene');
    expect(() => validateEvaluationForContext({ ...baselineEvaluation, evidenceQuote: '我想买海港的票' }, baselineTurnContext, baselineTurnRequest.input.text)).toThrow('substring');
    expect(() => validateEvaluationForContext({ ...baselineEvaluation, evidenceQuote: '' }, baselineTurnContext, baselineTurnRequest.input.text)).toThrow('supporting evidence');
    expect(() => validateEvaluationForContext(baselineEvaluation, { ...baselineTurnContext, missionId: 'B1', mode: 'boss' }, baselineTurnRequest.input.text)).toThrow('coach: null');
  });
});

describe('declarative authored graph boundaries', () => {
  const terminalTransition = { trigger: { type: 'choose', choiceId: 'p1.pay-cafe' }, requiredFlags: {}, guards: [], setFlags: {}, nextNode: null, result: 'clear' };
  const graph = {
    id: 'P1', mode: 'practice', startNode: 'p1.fixture',
    nodes: [{ id: 'p1.fixture', objective: 'Contract example only', actionTransitions: [terminalTransition], intentTransitions: [], checkpoint: false }],
    reward: { id: 'p1.first-clear', xp: 100, items: { hint: 1, freeze: 0 }, independentRepairXp: 20 },
    prerequisiteMissionIds: [], allowedActionIds: ['p1.pay-cafe'], variants: [{ tier: 1, factSnapshots: [{ id: 'p1.initial', facts: { coffee: 'unavailable' } }], targetTracks: ['reading', 'conversation'], cueIds: ['p1.entrance-sign'] }], hints: [], activeTimerMs: null,
  };

  it('accepts a terminal-reachable fixture graph, without providing live content', () => {
    expect(MissionDefinitionSchema.safeParse(graph).success).toBe(true);
  });

  it('rejects invented executable guards, missing references, loops, and orphan nodes', () => {
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0], actionTransitions: [{ ...terminalTransition, guards: [{ op: 'eval', expression: 'true' }] }] }] }).success).toBe(false);
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0], actionTransitions: [{ ...terminalTransition, result: 'none', nextNode: 'p1.missing' }] }] }).success).toBe(false);
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0], actionTransitions: [{ ...terminalTransition, result: 'none', nextNode: 'p1.fixture' }] }] }).success).toBe(false);
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [...graph.nodes, { ...graph.nodes[0], id: 'p1.orphan' }] }).success).toBe(false);
  });

  it('leaves the real engine visibly unimplemented', () => {
    expect(() => createGame({ sessionId: 's-1', attemptId: 'a-1', missionId: 'P1', initialTier: 1, validationMode: true, inputPreference: 'voice', providerStatus: 'fixture' }, BASELINE_NOW_MS)).toThrow(SegmentNotImplementedError);
  });
});
