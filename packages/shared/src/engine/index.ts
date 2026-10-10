import type { CreateGameOptions, EngineResult, GameAction, InternalState, NpcId, PublicState, TurnEvaluation } from '../contracts.js';

export class SegmentNotImplementedError extends Error {
  readonly code = 'SEGMENT_NOT_IMPLEMENTED';
  constructor(readonly segment: string, readonly feature: string) {
    super(`${feature} is unimplemented; build ${segment}.`);
    this.name = 'SegmentNotImplementedError';
  }
}

export function createGame(_options: CreateGameOptions, _nowMs: number): InternalState {
  throw new SegmentNotImplementedError('Segment-001', 'createGame');
}
export function applyAction(_state: InternalState, _action: GameAction, _nowMs: number): EngineResult {
  throw new SegmentNotImplementedError('Segment-001', 'applyAction');
}
export function applyEvaluation(_state: InternalState, _npcId: NpcId, _evaluation: TurnEvaluation, _nowMs: number): EngineResult {
  throw new SegmentNotImplementedError('Segment-001', 'applyEvaluation');
}
export function projectPublicState(_state: InternalState, _nowMs: number): PublicState {
  throw new SegmentNotImplementedError('Segment-001', 'projectPublicState');
}
