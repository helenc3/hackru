export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Explicit scaffold state, never a fabricated successful game/provider result. */
export class SegmentNotImplementedError extends HttpError {
  constructor(segment: 'Segment-001' | 'Segment-002' | 'Segment-005', feature: string) {
    super(501, 'SEGMENT_NOT_IMPLEMENTED', `${feature} is unimplemented. Build ${segment}.`);
    this.name = 'SegmentNotImplementedError';
  }
}
