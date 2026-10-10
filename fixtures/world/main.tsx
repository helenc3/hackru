import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBaselineState, type GameAction, type MissionId } from '@vibequest/shared';
import { WorldRenderer } from '../../apps/web/src/world/WorldRenderer';
import '../../apps/web/src/app/styles.css';

// Isolated callback fixture, never imported by the production shell. It models
// only shared props and callback delivery, not mission/evaluation/reward rules.
function Fixture() {
  const [state, setState] = useState(() => ({ ...createBaselineState('P1'), visibleCues: [{ id: 'p1.entrance-sign', label: '入口告示', text: '请从广场进入。这扇门关闭了。' }] }));
  const [actions, setActions] = useState<GameAction[]>([]);
  const [npc, setNpc] = useState<string | null>(null);
  const [delay, setDelay] = useState(false);
  const [fail, setFail] = useState(false);
  return <div style={{ maxWidth: 1100, margin: '20px auto' }}>
    <h1>World callback fixture</h1>
    <p>Fixture callbacks only. No mission progression or provider calls.</p>
    <label>Mission <select aria-label="Mission" onChange={(event) => { setState({ ...createBaselineState(event.target.value as MissionId), visibleCues: [] }); setActions([]); }}><option>P1</option><option>P2</option><option>B1</option></select></label>
    <label><input type="checkbox" aria-label="Delay callback" checked={delay} onChange={(event) => setDelay(event.target.checked)} />Delay callback</label>
    <label><input type="checkbox" aria-label="Fail callback" checked={fail} onChange={(event) => setFail(event.target.checked)} />Fail callback</label>
    <WorldRenderer state={state} onAction={async (action) => {
      if (delay) await new Promise((resolve) => setTimeout(resolve, 400));
      if (fail) throw new Error('Fixture connection failed');
      setActions((previous) => [...previous, action]);
      setState((previous) => ({ ...previous, version: previous.version + 1, ...(action.type === 'moveZone' ? { zoneId: action.zoneId } : {}) }));
    }} onTalk={setNpc} />
    {npc && <section role="dialog" aria-label="NPC conversation" onKeyDown={(event) => { if (event.key === 'Escape') { setNpc(null); document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus(); } }}><h2>{npc}</h2><textarea aria-label="Dialogue input" autoFocus /><button onClick={() => setNpc(null)}>Close conversation</button></section>}
    <output data-testid="actions">{JSON.stringify(actions)}</output>
    <output data-testid="reward-state">{JSON.stringify({ xp: state.xp, badges: state.badges, inventory: state.inventory })}</output>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
