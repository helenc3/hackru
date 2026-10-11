import { useState } from 'react';
import { MissionIdSchema, type MissionId, type PublicState } from '@vibequest/shared';
import { missionTitles } from './ResultPanel';

/** English instructions per quest (NEW_QUESTS.md); world text stays Simplified Chinese. */
export const missionInstructions: Record<MissionId, string> = {
  Q1: 'Find 老王 (Lao Wang) at his drink stand a few steps from where you start (follow the arrow in this menu). Ask for a drink in Mandarin, then press Pay.',
  Q2: 'Find 小李 (Xiao Li) on the avenue just east of the start (follow the arrow in this menu) and ask in Mandarin how to get to 上海大酒店 (Shanghai Grand Hotel).',
  Q3: 'Head east to the 黄浦江 (Huangpu River) promenade — follow the arrow in this menu or press Walk there. A passer-by waits at the viewing deck; ask them to take your photo and they will show you where to stand.',
};

export function QuestPanel({ state, results, onReview, conversationOpen = false, guidanceRef }: { state: PublicState; results: Partial<Record<MissionId, PublicState>>; onReview: (missionId: MissionId) => void; conversationOpen?: boolean; guidanceRef?: (element: HTMLDivElement | null) => void }) {
  const [open, setOpen] = useState(true);
  return <aside className="quest-panel" aria-label="Current quest" data-testid="quest-panel" data-collapsed={!open} inert={conversationOpen}>
    <header><span className="eyebrow">QUEST {MissionIdSchema.options.indexOf(state.missionId) + 1} OF 3</span><button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Hide' : 'Show'}</button></header>
    <h2>{missionTitles[state.missionId]}</h2>
    <div className="quest-guidance" ref={guidanceRef} />
    {open && <>
    <hr className="quest-guidance-divider" />
    <p className="quest-instructions">{missionInstructions[state.missionId]}</p>
    <ul className="mission-progress" aria-label="Quest progress" data-testid="mission-progress">{MissionIdSchema.options.map((id) => { const result = results[id]; return <li key={id} data-locked={!state.unlockedMissionIds.includes(id)}>
      <input type="checkbox" checked={state.completedMissionIds.includes(id)} readOnly tabIndex={-1} aria-label={`${missionTitles[id]} cleared`} />
      <span>{missionTitles[id]}</span>
      {result && <button type="button" className="button secondary" aria-label={`Review ${missionTitles[id]}`} onClick={() => onReview(id)}>Review</button>}
    </li>; })}</ul>
    </>}
  </aside>;
}
