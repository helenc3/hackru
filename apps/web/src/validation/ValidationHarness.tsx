import type { RendererProps } from '@vibequest/shared';

/**
 * The same HTTP actions and shared dialogue panel, in an isolated server validation session.
 * It drives the same engine as the world; validation sessions never earn listening evidence or player achievements.
 */
export function ValidationHarness({ state, onAction, onTalk }: RendererProps) {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_VALIDATION_HARNESS !== 'true' || !state.validationMode) return null;
  return <aside className="validation-panel" data-testid="validation-harness">
    <h2>Internal validation harness</h2><p>Developer-only session. Simulated achievements cannot transfer to player progress. Dialogue uses the same NPC panel and typed Mandarin fallback.</p>
    <p>Position {state.position.x.toFixed(1)}, {state.position.z.toFixed(1)} · {state.zoneId}</p>
    <h3>Nearby anchors</h3><div className="validation-controls">{state.interactables.map((target) => <button className="button secondary" key={target.id} onClick={() => void (async () => {
      // Validation sessions may relocate directly; the server still requires a committed walkable position.
      await onAction({ type: 'move', position: target.position });
      if (target.kind === 'npc') onTalk(target.id);
      else if (target.kind === 'photo-spot' && state.photo) await onAction({ type: 'choose', choiceId: 'q3.start-photo', anchorId: state.photo.viewpointAnchorId });
    })().catch(() => undefined)}>{target.kind}{target.role ? `/${target.role}` : ''} · {target.id}</button>)}</div>
    <details><summary>Projected state · no evaluator or secret facts</summary><pre>{JSON.stringify(state, null, 2)}</pre></details>
  </aside>;
}
