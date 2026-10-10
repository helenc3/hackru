import type { PublicState, RendererProps } from '@vibequest/shared';

export function InventoryBar({ state, pending, paused, onPause, onAction }: { state: PublicState; pending: boolean; paused: boolean; onPause: () => void; onAction: RendererProps['onAction'] }) {
  return <section className="inventory-bar" aria-label="Inventory" data-testid="inventory-bar">
    <span>{state.validationMode ? 'Simulated XP' : 'XP'} <strong>{state.xp}</strong></span>
    {state.mode === 'practice' && state.status === 'active' && <>
      {state.capabilities.hints && <button className="button secondary" disabled={pending || !state.inventory.hint} onClick={() => void onAction({ type: 'useItem', item: 'hint' }).catch(() => undefined)}>Hint · {state.inventory.hint}</button>}
      {state.capabilities.freeze && <button className="button secondary" disabled={pending || !state.inventory.freeze} onClick={() => void onAction({ type: 'useItem', item: 'freeze' }).catch(() => undefined)}>Freeze · {state.inventory.freeze}</button>}
      {state.capabilities.coach && <button className="button secondary" disabled={pending} onClick={onPause}>{paused ? 'Resume practice' : 'Pause & Learn'}</button>}
    </>}
    {state.mode === 'boss' && <span>Independent attempt · clarification in Mandarin is allowed</span>}
  </section>;
}
