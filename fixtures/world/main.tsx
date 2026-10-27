import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameAction, PublicState } from '@vibequest/shared';
import { WorldRenderer } from '../../apps/web/src/world/WorldRenderer';
import { fixtureCity, FIXTURE_WORLD } from './city';
import '../../apps/web/src/app/styles.css';

// Isolated callback fixture, never imported by the production shell. It models only shared props and
// callback delivery over a static fixture city, not quest/evaluation/reward rules.
// `?stream` instead streams from /api (tests mock the routes) to exercise server-owned streaming.
const streaming = new URLSearchParams(location.search).has('stream');
const manifests = streaming ? undefined : fixtureCity();
// A wall immediately behind spawn exercises the shoulder camera without changing ordinary journeys.
if (new URLSearchParams(location.search).has('camera-wall')) manifests?.find((chunk) => chunk.coord.cx === 0 && chunk.coord.cz === 0)?.placements.push({
  id: 'camera-wall', assetId: 'bld.warehouse.shed', params: { width: 8, depth: 6 }, x: 20, z: 15, rotation: 0,
});
const at = (x: number, z: number) => ({ x, z });
const baseline: PublicState = {
  sessionId: 'fixture-session', worldId: streaming ? 'stream-world' : FIXTURE_WORLD, version: 0, missionId: 'Q1', mode: 'practice', status: 'active', zoneId: 'park', position: at(20, 10), tier: 0,
  objectives: [{ id: 'q1.buy', label: 'Buy a drink from 老王 (Lao Wang).', complete: false }],
  interactables: [
    { id: 'fixture.vendor', kind: 'npc', role: 'vendor', label: '老王', position: at(16, 4) },
    { id: 'fixture.pay', kind: 'choice', label: '付款', position: at(12, 4), choiceId: 'q1.pay' },
  ],
  npcMood: { vendor: 'warm', guide: 'warm', passerby: 'warm' },
  inventory: { hint: 0, cny: 20, drinks: [] }, purchases: [], xp: 0, badges: [], unlockedMissionIds: ['Q1'], completedMissionIds: [], directions: null, photo: null, timer: null,
  capabilities: { coach: true, hints: true, freeze: false }, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture',
};

function Fixture() {
  const [state, setState] = useState(baseline);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [npc, setNpc] = useState<string | null>(null);
  const [delay, setDelay] = useState(false);
  const [fail, setFail] = useState(false);
  return <div style={{ maxWidth: 1100, margin: '20px auto' }}>
    <h1>World callback fixture</h1>
    <p>Fixture callbacks only. No quest progression or provider calls.</p>
    <label><input type="checkbox" aria-label="Delay callback" checked={delay} onChange={(event) => setDelay(event.target.checked)} />Delay callback</label>
    <label><input type="checkbox" aria-label="Fail callback" checked={fail} onChange={(event) => setFail(event.target.checked)} />Fail callback</label>
    <WorldRenderer state={state} conversationOpen={Boolean(npc)} manifests={manifests} onAction={async (action) => {
      if (delay) await new Promise((resolve) => setTimeout(resolve, 400));
      if (fail) throw new Error('Fixture connection failed');
      setActions((previous) => [...previous, action]);
      setState((previous) => ({ ...previous, version: previous.version + 1 }));
    }} onTalk={setNpc} />
    {npc && <section role="dialog" aria-label="NPC conversation" onKeyDown={(event) => { if (event.key === 'Escape') { setNpc(null); document.querySelector<HTMLElement>('[data-testid="world-renderer"]')?.focus(); } }}><h2>{npc}</h2><textarea aria-label="Dialogue input" autoFocus /><button onClick={() => setNpc(null)}>Close conversation</button></section>}
    <output data-testid="actions">{JSON.stringify(actions)}</output>
    <output data-testid="reward-state">{JSON.stringify({ xp: state.xp, badges: state.badges, inventory: state.inventory })}</output>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
