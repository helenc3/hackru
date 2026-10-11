import { useEffect, useRef } from 'react';
import { cues, missions, type MissionId, type PublicState, type RendererProps } from '@vibequest/shared';
import { SkillDebrief } from './SkillDebrief';
import { useEscape } from './use-escape';

/** The quest NPC's name when they walked off (the only way an attempt fails). */
const questNpcNames: Record<MissionId, string> = { Q1: '老王', Q2: '小李', Q3: 'The passer-by' };
export const missionTitles: Record<MissionId, string> = { Q1: 'Buy a drink from Lao Wang', Q2: 'Ask Xiao Li the way', Q3: 'A photo by the Huangpu' };

/** Study list from authored content only: cue text plus the "X means Y" glosses inside the mission hints. */
export function vocabFor(missionId: MissionId): { zh: string; en: string; kind: 'reading' | 'listening' | 'conversation' }[] {
  const fromCues = cues.filter((cue) => cue.missionId === missionId).map((cue) => ({ zh: cue.textZh, en: cue.englishMeaning, kind: 'reading' as const }));
  const glosses = missions.find((mission) => mission.id === missionId)?.hints.filter((hint) => hint.level === 2).flatMap((hint) => [...hint.text.matchAll(/([^\s;.]+) means ([^;.]+)/g)].map((match) => ({ zh: match[1]!, en: match[2]!, kind: 'conversation' as const }))) ?? [];
  return [...fromCues, ...glosses];
}

export function ResultPanel({ state, live, pending, onAction, onExit, onClose }: { state: PublicState; live: PublicState; pending: boolean; onAction: RendererProps['onAction']; onExit: () => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  useEscape(onClose);
  if (state.status === 'active') return null;
  // Reviewing an earlier mission while another attempt is active: read-only.
  const review = live.sessionId !== state.sessionId || live.missionId !== state.missionId || live.version !== state.version;
  const canAct = live.status !== 'active';
  const next = state.missionId === 'Q1' ? 'Q2' : state.missionId === 'Q2' ? 'Q3' : null;
  const weak = state.debrief ? Object.entries(state.debrief.tracks).filter(([track, skill]) => track !== 'repair' && (skill.independentCount === 0 || skill.mastery < 0.65)).map(([track]) => track) : [];
  const vocab = vocabFor(state.missionId);
  const start = (missionId: MissionId) => void onAction({ type: 'startMission', missionId }).catch(() => undefined);
  return <section className="result-panel" role="dialog" aria-labelledby="result-title" data-testid="result-panel" data-review={review}>
    <button ref={close} type="button" className="button secondary result-close" onClick={onClose} aria-label="Close results">✕</button>
    <span className="eyebrow">{state.validationMode ? 'SIMULATED RESULT · NO PLAYER ACHIEVEMENT' : review ? 'QUEST REVIEW' : state.status === 'failed' ? 'QUEST FAILED' : 'QUEST COMPLETE'}</span>
    <h2 id="result-title">{state.status === 'cleared' ? 'Nicely done.' : `${questNpcNames[state.missionId]} got tired of chatting.`}</h2>
    <p>{missionTitles[state.missionId]} · {state.status === 'cleared' ? 'The server confirmed the required objectives.' : 'Try again and get to the point sooner. Your next attempt starts a fresh conversation; earlier rewards and money are kept.'}</p>
    <ul className="result-objectives" aria-label="Quest summary">{state.objectives.map((objective) => <li key={objective.id}><input type="checkbox" checked={objective.complete} readOnly tabIndex={-1} aria-label={objective.label} /><span>{objective.label}</span></li>)}</ul>
    {state.badges.map((badge) => <span className="earned-badge" key={badge}>{state.validationMode ? 'Simulated badge: ' : 'Badge: '}{badge === 'shanghai-explorer' ? 'Shanghai Explorer' : badge}</span>)}
    <div className="result-actions">
      {canAct && !review && state.status === 'cleared' && next && <button className="button primary" disabled={pending} onClick={() => start(next)}>Next quest</button>}
      {canAct && state.status === 'failed' && <button className="button primary" disabled={pending} onClick={() => start(state.missionId)}>Try again</button>}
      {canAct && <button className="button secondary" disabled={pending} onClick={onExit}>Return to start</button>}
      <button className="button secondary" disabled={pending} onClick={onClose}>{canAct ? 'Close' : 'Back to quest'}</button>
    </div>
    <section className="vocab-review" aria-label="Vocab to study" data-testid="vocab-review">
      <h3>Vocab to study</h3>
      {weak.length > 0 && <p>Focus: {weak.join(', ')}.</p>}
      <dl>{vocab.map((entry) => <div key={entry.zh} data-focus={weak.includes(entry.kind)}><dt lang="zh-Hans">{entry.zh}</dt><dd>{entry.en}</dd></div>)}</dl>
    </section>
    <SkillDebrief state={state} />
  </section>;
}
