import { useEffect, useState } from 'react';
import type { MissionId, PublicState } from '@vibequest/shared';
import { missionTitles } from './ResultPanel';

export function QuestPanel({ state, results, onReview }: { state: PublicState; results: Partial<Record<MissionId, PublicState>>; onReview: (missionId: MissionId) => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const timer = state.timer;
  const remaining = timer ? Math.max(0, timer.remainingMs - (timer.running ? Math.max(0, now - timer.syncedAtMs) : 0)) : null;
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  const [open, setOpen] = useState(true);
  const done = state.objectives.filter((objective) => objective.complete).length;
  return <aside className="quest-panel" aria-label="Mission objectives" data-testid="quest-panel" data-collapsed={!open}>
    <header><span className="eyebrow">{state.mode === 'boss' ? 'BOSS · INDEPENDENT ATTEMPT' : 'PRACTICE'}</span><button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Hide' : 'Show'}</button></header>
    <h2>{missionTitles[state.missionId]}</h2>
    {!open && <span className="quest-progress">{done}/{state.objectives.length} objectives</span>}
    {open && <>
    <div className="mission-meta"><span>{state.missionId} · Tier {state.tier}</span><span>{state.status}</span></div>
    {seconds !== null && <div className="mission-clock" role="timer" aria-label="Mission time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}<span>{timer?.running ? 'Active decision time' : 'Timer paused by server'}</span></div>}
    <ol className="objective-list">{state.objectives.map((objective) => <li key={objective.id} data-complete={objective.complete}><span aria-hidden="true">{objective.complete ? '✓' : '○'}</span><span>{objective.label}</span></li>)}</ol>
    <ul className="mission-progress" aria-label="Mission progress" data-testid="mission-progress">{(['P1', 'P2', 'B1'] as const).map((id) => { const result = results[id]; return <li key={id}>
      <input type="checkbox" checked={result?.status === 'cleared'} readOnly tabIndex={-1} aria-label={`${missionTitles[id]} cleared`} />
      <span>{missionTitles[id]}</span>
      {result && <button type="button" className="button secondary" aria-label={`Review ${missionTitles[id]}`} onClick={() => onReview(id)}>Review</button>}
    </li>; })}</ul>
    <p className="controls-note">WASD / arrows · E to interact<br />Read signs and listen before choosing your route.</p>
    </>}
  </aside>;
}
