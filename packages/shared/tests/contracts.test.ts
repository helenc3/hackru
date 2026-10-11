import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ActionRequestSchema, ActionResponseSchema, AudioOperationSchema, CreateSessionRequestSchema, EvidenceRecordSchema, GameActionSchema, InternalStateSchema, MissionDefinitionSchema,
  PublicStateSchema, TranscriptionRecordSchema, TranscriptionResponseSchema, TurnContextSchema, TurnEvaluationSchema, TurnProvenanceRecordSchema, TurnRequestSchema, TurnResponseSchema, validateEvaluationForContext,
} from '../src/contracts.js';
import {
  BASELINE_NOW_MS, baselineActionRequest, baselineActionResponse, baselineEvaluation, baselineInternalState, baselineStates, baselineTranscriptionRecord,
  baselineTurnContext, baselineTurnProvenance, baselineTurnRequest, createBaselineState, malformedEvaluation,
} from '../src/fixtures.js';

describe('shared contract boundary fixtures', () => {
  it('rejects the removed quest restart action', () => {
    expect(GameActionSchema.safeParse({ type: 'retryMission' }).success).toBe(false);
  });

  it('rejects removed sign inspection actions', () => {
    expect(GameActionSchema.safeParse({ type: 'inspect', targetId: 'a.menu' }).success).toBe(false);
  });

  it('validates all three quests without inventing completed gameplay', () => {
    for (const state of Object.values(baselineStates)) {
      expect(PublicStateSchema.parse(state)).toEqual(state);
      expect(state).toMatchObject({ status: 'active', xp: 0, badges: [], validationMode: true, providerStatus: 'fixture', timer: null, directions: null, photo: null, interactables: [] });
      expect(state.objectives.every((objective) => !objective.complete)).toBe(true);
    }
    const first = createBaselineState(); first.inventory.cny = 0;
    expect(createBaselineState().inventory.cny).toBe(20);
  });
  it('validates the portable JSON examples used by other accounts', () => {
    const examples = [
      ['action-request.json', ActionRequestSchema], ['action-response.json', ActionResponseSchema], ['turn-request.json', TurnRequestSchema], ['practice-turn-response.json', TurnResponseSchema],
      ['transcription-response.json', TranscriptionResponseSchema], ['transcription-record.json', TranscriptionRecordSchema], ['turn-context.json', TurnContextSchema],
      ['turn-provenance-record.json', TurnProvenanceRecordSchema], ['internal-state.json', InternalStateSchema], ['valid-evaluation.json', TurnEvaluationSchema],
    ] as const;
    for (const [filename, schema] of examples) {
      const value: unknown = JSON.parse(readFileSync(new URL(`../../../fixtures/baseline/${filename}`, import.meta.url), 'utf8'));
      expect(schema.safeParse(value).success, filename).toBe(true);
    }
    const states = JSON.parse(readFileSync(new URL('../../../fixtures/baseline/public-states.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(states)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(Object.values(states).every((state) => PublicStateSchema.safeParse(state).success)).toBe(true);
  });
  it('allows a debrief only after a quest ends', () => {
    const debrief = { tracks: Object.fromEntries(['reading', 'listening', 'conversation', 'repair'].map((track) => [track, { mastery: 0.4, independentCount: 0 }])), strengths: [], improvement: 'Try a spoken request.', nextPracticeReason: 'No evidence yet.', evidenceSummary: { spokenTurns: 0, typedTurns: 1, editedTurns: 0, independentListening: 0, assistedListening: 0 } };
    expect(PublicStateSchema.safeParse({ ...baselineStates.Q1, debrief }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.Q1, status: 'cleared', debrief }).success).toBe(true);
  });
  it('rejects nonfinite, overflowing, forged, and duplicate values at boundaries', () => {
    expect(PublicStateSchema.safeParse({ ...baselineStates.Q1, xp: Infinity }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.Q1, inventory: { hint: 0, cny: 2000, drinks: [] } }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.Q1, inventory: { hint: 0, cny: 5, drinks: ['coffee'] } }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.Q1, objectives: [...baselineStates.Q1.objectives, ...baselineStates.Q1.objectives] }).success).toBe(false);
    expect(PublicStateSchema.safeParse({ ...baselineStates.Q1, secretFacts: {} }).success).toBe(false);
    expect(ActionRequestSchema.safeParse({ ...baselineActionRequest, expectedVersion: -1 }).success).toBe(false);
    expect(GameActionSchema.safeParse({ type: 'move', position: { x: NaN, z: 0 } }).success).toBe(false);
    expect(GameActionSchema.safeParse({ type: 'move', position: { x: 20_000, z: 0 } }).success).toBe(false);
    expect(GameActionSchema.safeParse({ type: 'choose', choiceId: 'q1.win-immediately', anchorId: 'a' }).success).toBe(false);
    expect(GameActionSchema.safeParse({ type: 'photoCapture', photoRequestId: 'p', outcome: 'captured', imageDigest: 'not-hex' }).success).toBe(false);
    expect(ActionResponseSchema.parse(baselineActionResponse).events).toEqual([]);
  });
  it('defaults to voice and models provenance without trusting it as verification', () => {
    expect(CreateSessionRequestSchema.parse({ initialTier: 1, providerMode: 'fixture' }).inputPreference).toBe('voice');
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '茶', source: 'stt' } }).success).toBe(false);
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '茶', source: 'typed', transcriptionId: 'forged' } }).success).toBe(false);
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, anchorId: undefined }).success).toBe(false);
    expect(TurnRequestSchema.safeParse({ ...baselineTurnRequest, input: { text: '   ', source: 'typed' } }).success).toBe(false);
    expect(TranscriptionRecordSchema.safeParse({ ...baselineTranscriptionRecord, expiresAtMs: BASELINE_NOW_MS }).success).toBe(false);
    expect(TurnProvenanceRecordSchema.safeParse({ ...baselineTurnProvenance, text: '请给我一杯水。' }).success).toBe(false);
    expect(TurnProvenanceRecordSchema.safeParse({ ...baselineTurnProvenance, text: '请给我一杯水。', source: 'stt-edited' }).success).toBe(true);
  });
  it('binds pending input to the current attempt and permits one registered audio operation', () => {
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, pendingTurn: baselineTurnProvenance }).success).toBe(true);
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, pendingTurn: { ...baselineTurnProvenance, attemptId: 'abandoned-attempt' } }).success).toBe(false);
    const operation = { id: 'recording-1', attemptId: baselineInternalState.attemptId, kind: 'recording', phase: 'recording', registeredAtMs: BASELINE_NOW_MS, phaseStartedAtMs: BASELINE_NOW_MS, phaseDeadlineMs: BASELINE_NOW_MS + 15_000, finished: false } as const;
    expect(AudioOperationSchema.safeParse(operation).success).toBe(true);
    expect(AudioOperationSchema.safeParse({ ...operation, phaseDeadlineMs: BASELINE_NOW_MS + 15_001 }).success).toBe(false);
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, audioOperations: [operation], activeAudioOperationId: operation.id }).success).toBe(true);
    expect(InternalStateSchema.safeParse({ ...baselineInternalState, audioOperations: [operation], activeAudioOperationId: null }).success).toBe(false);
  });
  it('never certifies assisted or validation evidence as independent', () => {
    const evidence = { id: 'e-1', attemptId: 'a-1', missionId: 'Q1', track: 'reading', cueId: 'q1.menu', score: 1, independent: true, firstAttempt: true, validationMode: false, listeningAssisted: false, providerFailure: false };
    expect(EvidenceRecordSchema.safeParse(evidence).success).toBe(true);
    for (const patch of [{ validationMode: true }, { listeningAssisted: true }, { providerFailure: true }]) expect(EvidenceRecordSchema.safeParse({ ...evidence, ...patch }).success).toBe(false);
  });
});

describe('private evaluation validation', () => {
  it('accepts meaningful Mandarin and rejects malformed scores/slots', () => {
    expect(validateEvaluationForContext(baselineEvaluation, baselineTurnContext, baselineTurnRequest.input.text)).toEqual(baselineEvaluation);
    expect(TurnEvaluationSchema.safeParse(malformedEvaluation).success).toBe(false);
    expect(TurnEvaluationSchema.safeParse({ ...baselineEvaluation, intent: 'greeting' }).success).toBe(false);
    expect(TurnEvaluationSchema.safeParse({ ...baselineEvaluation, intent: 'accept_substitute', slots: [{ key: 'drink', value: 'coffee' }] }).success).toBe(false);
    expect(TurnEvaluationSchema.safeParse({ ...baselineEvaluation, intent: 'ask_directions', slots: [{ key: 'destination', value: 'the-moon' }] }).success).toBe(false);
  });
  it('checks scene intents and evidence against the actual player text', () => {
    expect(() => validateEvaluationForContext({ ...baselineEvaluation, intent: 'request_photo', slots: [] }, baselineTurnContext, baselineTurnRequest.input.text)).toThrow('active scene');
    expect(() => validateEvaluationForContext({ ...baselineEvaluation, evidenceQuote: '我想去上海大酒店' }, baselineTurnContext, baselineTurnRequest.input.text)).toThrow('substring');
    expect(() => validateEvaluationForContext({ ...baselineEvaluation, evidenceQuote: '' }, baselineTurnContext, baselineTurnRequest.input.text)).toThrow('supporting evidence');
  });
});

describe('declarative authored graph boundaries', () => {
  const terminal = { trigger: { type: 'choose', choiceId: 'q1.pay' }, requiredFlags: {}, guards: [], setFlags: {}, nextNode: null, result: 'clear' };
  const graph = {
    id: 'Q1', mode: 'practice', title: 'Fixture', startNode: 'q1.fixture', npcRoles: ['vendor'],
    nodes: [{ id: 'q1.fixture', objective: 'Contract example only', actionTransitions: [terminal], intentTransitions: [], checkpoint: false }],
    reward: { id: 'q1.first-clear', xp: 100, items: { hint: 1 } }, prerequisiteMissionIds: [], allowedActionIds: ['q1.pay'],
    variants: [{ tier: 1, factSnapshots: [{ id: 'q1.initial', facts: { coffee: 'unavailable' } }], targetTracks: ['reading', 'conversation'], cueIds: ['q1.menu'] }], hints: [],
  };
  it('accepts a terminal-reachable graph and rejects invented guards, missing references, loops, and orphans', () => {
    expect(MissionDefinitionSchema.safeParse(graph).success).toBe(true);
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0], actionTransitions: [{ ...terminal, guards: [{ op: 'eval', expression: 'true' }] }] }] }).success).toBe(false);
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0], actionTransitions: [{ ...terminal, result: 'none', nextNode: 'q1.missing' }] }] }).success).toBe(false);
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [{ ...graph.nodes[0], actionTransitions: [{ ...terminal, result: 'none', nextNode: 'q1.fixture' }] }] }).success).toBe(false);
    expect(MissionDefinitionSchema.safeParse({ ...graph, nodes: [...graph.nodes, { ...graph.nodes[0], id: 'q1.orphan' }] }).success).toBe(false);
  });
});
