import type { RendererProps } from '@vibequest/shared';

/** Developer-only mount. Segment-003 implements the internal text validator. */
export function ValidationHarness({ state }: RendererProps) {
  return (
    <aside className="validation-panel" data-testid="validation-harness">
      <strong>Internal validation harness</strong>
      <p>Unimplemented · Segment-003. Fixture mission {state.missionId}; no player progress or rewards.</p>
      <pre>{JSON.stringify({ sessionId: state.sessionId, version: state.version, validationMode: state.validationMode }, null, 2)}</pre>
    </aside>
  );
}
