import { useEffect, useState } from 'react';
import type { PublicState } from '@vibequest/shared';

export function QuestPanel({ state }: { state: PublicState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const timer = state.timer;
  const remaining = timer ? Math.max(0, timer.remainingMs - (timer.running ? Math.max(0, now - timer.syncedAtMs) : 0)) : null;
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  const titles = { P1: 'Café detour', P2: 'The platform changed', B1: 'Make the connection' };
  const [open, setOpen] = useState(true);
  const done = state.objectives.filter((objective) => objective.complete).length;
  return <aside className="quest-panel" aria-label="Mission objectives" data-testid="quest-panel" data-collapsed={!open}>
    <header><span className="eyebrow">{state.mode === 'boss' ? 'BOSS · INDEPENDENT ATTEMPT' : 'PRACTICE'}</span><button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Hide' : 'Show'}</button></header>
    <h2>{titles[state.missionId]}</h2>
    {!open && <span className="quest-progress">{done}/{state.objectives.length} objectives</span>}
    {open && <>
    <div className="mission-meta"><span>{state.missionId} · Tier {state.tier}</span><span>{state.status}</span></div>
    {seconds !== null && <div className="mission-clock" role="timer" aria-label="Mission time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}<span>{timer?.running ? 'Active decision time' : 'Timer paused by server'}</span></div>}
    <ol className="objective-list">{state.objectives.map((objective) => <li key={objective.id} data-complete={objective.complete}><span aria-hidden="true">{objective.complete ? '✓' : '○'}</span><span>{objective.label}</span></li>)}</ol>
    <p className="controls-note">WASD / arrows · E to interact<br />Read signs and listen before choosing your route.</p>
    </>}
  </aside>;
}
