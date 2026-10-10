import type { InternalState } from '@vibequest/shared';
import { SegmentNotImplementedError } from './errors.js';

/** Segment-001 owns persistence, serialization, and idempotency implementation. */
export interface SessionRecord {
  id: string;
  state: InternalState;
}

export interface SessionStore {
  create(state: InternalState): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | undefined>;
  withSession<T>(
    sessionId: string,
    operation: (session: SessionRecord) => Promise<T>,
  ): Promise<T>;
}

export function createSessionStore(): SessionStore {
  const unavailable = () => new SegmentNotImplementedError('Segment-001', 'Session storage');
  return {
    create: () => Promise.reject(unavailable()),
    get: () => Promise.reject(unavailable()),
    withSession: () => Promise.reject(unavailable()),
  };
}
