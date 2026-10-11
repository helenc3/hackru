import { Button, Badge } from './primitives';
import type { PublicState, RendererProps } from '@vibequest/shared';

export function InventoryBar({ state, pending, paused, onPause, onAction }: { state: PublicState; pending: boolean; paused: boolean; onPause: () => void; onAction: RendererProps['onAction'] }) {
  return <section className="inventory-bar" aria-label="Inventory" data-testid="inventory-bar">
    <Badge className="xp-badge">{state.validationMode ? 'Simulated XP' : 'XP'} <strong>{state.xp}</strong></Badge>
    {state.mode === 'practice' && state.status === 'active' && <>
      {state.capabilities.hints && <Button className="button secondary" disabled={pending || !state.inventory.hint} onClick={() => void onAction({ type: 'useItem', item: 'hint' }).catch(() => undefined)}>Hint · {state.inventory.hint}</Button>}
      {state.capabilities.freeze && <Button className="button secondary" disabled={pending || !state.inventory.freeze} onClick={() => void onAction({ type: 'useItem', item: 'freeze' }).catch(() => undefined)}>Freeze · {state.inventory.freeze}</Button>}
      {state.capabilities.coach && <Button className="button secondary" disabled={pending} onClick={onPause}>{paused ? 'Resume practice' : 'Pause & Learn'}</Button>}
    </>}
  </section>;
}
