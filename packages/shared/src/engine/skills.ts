import type { InternalState, MissionId, Tier } from '../contracts.js';
import { SegmentNotImplementedError } from './index.js';

export function updateSkillsAfterAttempt(_state: InternalState): InternalState {
  throw new SegmentNotImplementedError('Segment-006', 'updateSkillsAfterAttempt');
}
export function selectPracticeTier(_state: InternalState, _missionId: MissionId): Tier {
  throw new SegmentNotImplementedError('Segment-006', 'selectPracticeTier');
}
