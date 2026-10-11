import { useState } from 'react';
import type { NpcAction, PublicState, RendererProps } from '@vibequest/shared';
import { requestWalk } from '../world/walk-request';

const drinkNames = { tea: '茶 tea', water: '水 water' } as const;

/** Buttons the server enabled for one NPC (state.npcActions plus any the latest turn added). The model never grants them. */
export function NpcActions({ state, anchorId, extra = [], pending, onAction, onClose, onEnd }: {
  state: PublicState; anchorId: string; extra?: readonly NpcAction[]; pending: boolean;
  onAction: RendererProps['onAction']; onClose: () => void; onEnd: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = state.npcActions.filter((entry) => entry.anchorId === anchorId).map((entry) => entry.action);
  const actions = [...current, ...extra.filter((action) => !current.some((entry) => entry.kind === action.kind) && action.kind === 'end-conversation')];
  if (!actions.length && !error) return null;
  async function pay(action: Extract<NpcAction, { kind: 'pay' }>) {
    setPaying(true); setError(null);
    try { await onAction({ type: 'choose', choiceId: 'q1.pay', anchorId: action.anchorId }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Payment failed. Try again.'); }
    finally { setPaying(false); }
  }
  return <>
    <div className="chat-actions" aria-label="Actions" data-testid="npc-actions">{actions.map((action) => {
      switch (action.kind) {
        case 'pay': {
          const short = state.inventory.cny < action.priceCny;
          return <button key="pay" className="button primary" disabled={pending || paying || short} data-testid="pay-button" onClick={() => void pay(action)}>
            <span lang="zh-Hans">付款</span> · Pay ¥{action.priceCny} for <span lang="zh-Hans">{drinkNames[action.drink]}</span>{short ? ` (only ¥${state.inventory.cny} left)` : ''}</button>;
        }
        case 'show-directions': return <button key="directions" className="button secondary" data-testid="show-directions" onClick={onClose}>Show directions</button>;
        // Walk after the panel closes and hands focus back to the world.
        case 'go-to-photo-spot': return <button key="spot" className="button secondary" data-testid="go-to-photo-spot" onClick={() => { onClose(); setTimeout(() => requestWalk(action.spot), 0); }}>Go to photo spot</button>;
        case 'end-conversation': return <button key="end" className="button secondary" data-testid="end-conversation" onClick={onEnd}>End conversation</button>;
      }
    })}</div>
    {error && <p className="thread-notice" role="alert" data-testid="action-error">{error}</p>}
  </>;
}
