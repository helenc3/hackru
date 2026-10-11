import { useState } from 'react';
import { MissionIdSchema, type MissionId, type PublicState } from '@vibequest/shared';
import { missionTitles } from './ResultPanel';

/** English instructions per quest (NEW_QUESTS.md); world text stays Simplified Chinese. */
export const missionInstructions: Record<MissionId, string> = {
  Q1: 'Find 老王 (Lao Wang) at his drink stand a few steps from where you start (follow the arrow at the top). Ask for a drink in Mandarin, then press Pay.',
  Q2: 'Find 小李 (Xiao Li) on the avenue just east of the start (follow the arrow at the top) and ask in Mandarin how to get to 上海大酒店 (Shanghai Grand Hotel).',
  Q3: 'Head east to the 黄浦江 (Huangpu River) promenade — follow the arrow at the top of the screen or press Walk there. A passer-by waits at the viewing deck; ask them to take your photo and they will show you where to stand.',
};

export function QuestPanel({ state, results, onReview }: { state: PublicState; results: Partial<Record<MissionId, PublicState>>; onReview: (missionId: MissionId) => void }) {
  const [open, setOpen] = useState(true);
  const done = state.objectives.filter((objective) => objective.complete).length;
  return <aside className="quest-panel" aria-label="Quest objectives" data-testid="quest-panel" data-collapsed={!open}>
    <header><span className="eyebrow">QUEST {MissionIdSchema.options.indexOf(state.missionId) + 1} OF 3</span><button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Hide' : 'Show'}</button></header>
    <h2>{missionTitles[state.missionId]}</h2>
    {!open && <span className="quest-progress">{done}/{state.objectives.length} objectives</span>}
    {open && <>
    <p className="quest-instructions">{missionInstructions[state.missionId]}</p>
    <div className="mission-meta"><span>{state.missionId} · Tier {state.tier}</span><span>{state.status}</span></div>
    <ol className="objective-list">{state.objectives.map((objective) => <li key={objective.id} data-complete={objective.complete}><span aria-hidden="true">{objective.complete ? '✓' : '○'}</span><span>{objective.label}</span></li>)}</ol>
    <ul className="mission-progress" aria-label="Quest progress" data-testid="mission-progress">{MissionIdSchema.options.map((id) => { const result = results[id]; return <li key={id} data-locked={!state.unlockedMissionIds.includes(id)}>
      <input type="checkbox" checked={state.completedMissionIds.includes(id)} readOnly tabIndex={-1} aria-label={`${missionTitles[id]} cleared`} />
      <span>{missionTitles[id]}</span>
      {result && <button type="button" className="button secondary" aria-label={`Review ${missionTitles[id]}`} onClick={() => onReview(id)}>Review</button>}
    </li>; })}</ul>
    <p className="controls-note">WASD / arrows · E to interact<br />Explore the streets; locals and signs speak Mandarin.</p>
    </>}
  </aside>;
}
