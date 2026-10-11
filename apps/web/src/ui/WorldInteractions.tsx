import type { GameAction, PublicState } from '@vibequest/shared';

/** Affordances only: the server publishes nearby anchors and owns proximity and quest guards. */
export function WorldInteractions({ state, pending, onAction, onTalk }: {
  state: PublicState; pending: boolean; onAction: (action: GameAction) => Promise<void>; onTalk: (anchorId: string) => void;
}) {
  const near = (item: PublicState['interactables'][number]) => Math.hypot(item.position.x - state.position.x, item.position.z - state.position.z) <= 6;
  const speakers = state.interactables.filter((item) => item.kind === 'npc' && near(item));
  const signs = state.interactables.filter((item) => item.kind === 'sign' && near(item));
  const disabled = pending || state.status !== 'active';
  return <section className="interaction-dock" aria-label="World interactions"><h2>Look, speak, act.</h2><p>Walk up to someone or something nearby. The server checks where you are and what your quest allows.</p><div>
    {speakers.map((item) => <button className="button secondary" key={item.id} disabled={disabled} onClick={() => onTalk(item.id)}><span lang="zh-Hans">{item.label}</span> · Talk</button>)}
    {signs.map((item) => <button className="button secondary" key={item.id} disabled={disabled} onClick={() => void onAction({ type: 'inspect', targetId: item.id }).catch(() => undefined)}><span lang="zh-Hans">{item.label}</span> · Read sign</button>)}
  </div></section>;
}
