import type { PublicState, RendererProps } from '@vibequest/shared';

const drinkNames = { tea: '茶', water: '水' } as const;

export function InventoryBar({ state, pending, paused, onPause, onAction }: { state: PublicState; pending: boolean; paused: boolean; onPause: () => void; onAction: RendererProps['onAction'] }) {
  return <section className="inventory-bar" aria-label="Inventory" data-testid="inventory-bar">
    <span>{state.validationMode ? 'Simulated XP' : 'XP'} <strong>{state.xp}</strong></span>
    <span data-testid="wallet">Money <strong>¥{state.inventory.cny}</strong></span>
    {state.inventory.drinks.length > 0 && <span data-testid="drinks">Drinks <strong lang="zh-Hans">{state.inventory.drinks.map((drink) => drinkNames[drink]).join(' · ')}</strong></span>}
    {state.status === 'active' && <>
      {state.capabilities.hints && <button className="button secondary" disabled={pending || !state.inventory.hint} onClick={() => void onAction({ type: 'useItem', item: 'hint' }).catch(() => undefined)}>Hint · {state.inventory.hint}</button>}
      {state.capabilities.coach && <button className="button secondary" disabled={pending} onClick={onPause}>{paused ? 'Resume practice' : 'Pause & Learn'}</button>}
    </>}
  </section>;
}
