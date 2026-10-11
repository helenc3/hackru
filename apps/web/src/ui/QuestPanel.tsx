import { Badge } from './primitives';
import { useEffect, useState } from 'react';
import type { PublicState } from '@vibequest/shared';

export function QuestPanel({ state }: { state: PublicState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const timer = state.timer;
  const remaining = timer ? Math.max(0, timer.remainingMs - (timer.running ? Math.max(0, now - timer.syncedAtMs) : 0)) : null;
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  const titles = { P1: 'Café detour', P2: 'The platform changed', B1: 'Make the connection' };
  return <aside className="quest-panel" aria-label="Mission objectives" data-testid="quest-panel">
    <div className="current-goal" data-completed-objectives={state.objectives.filter((objective) => objective.complete).length}><strong>{titles[state.missionId]}</strong><span>{state.objectives.find((objective) => !objective.complete)?.label ?? 'Mission complete'}</span></div>
    <Badge className="mission-state">{state.mode === 'boss' ? 'Boss' : 'Practice'} · {state.status}</Badge>
    {seconds !== null && <span className="mission-time" role="timer" aria-label="Mission time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>}
  </aside>;
}
