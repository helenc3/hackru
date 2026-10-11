import { useEffect, useRef } from 'react';
import { cues, missions, type MissionId, type PublicState, type RendererProps } from '@vibequest/shared';
import { SkillDebrief } from './SkillDebrief';

export const missionTitles: Record<MissionId, string> = { P1: 'Café detour', P2: 'The platform changed', B1: 'Make the connection' };

/** Study list from authored content only: cue text plus the "X means Y" glosses inside the mission hints. */
export function vocabFor(missionId: MissionId): { zh: string; en: string; kind: 'reading' | 'listening' | 'conversation' }[] {
  const fromCues = cues.filter((cue) => cue.missionId === missionId).map((cue) => ({ zh: cue.textZh, en: cue.englishMeaning, kind: cue.kind === 'sign' ? 'reading' as const : 'listening' as const }));
  const glosses = missions.find((mission) => mission.id === missionId)?.hints.filter((hint) => hint.level === 2).flatMap((hint) => [...hint.text.matchAll(/([^\s;.]+) means ([^;.]+)/g)].map((match) => ({ zh: match[1]!, en: match[2]!, kind: 'conversation' as const }))) ?? [];
  return [...fromCues, ...glosses];
}

export function ResultPanel({ state, live, pending, onAction, onExit, onClose }: { state: PublicState; live: PublicState; pending: boolean; onAction: RendererProps['onAction']; onExit: () => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  if (state.status === 'active') return null;
  // Reviewing an earlier mission while another attempt is active: read-only.
  const review = live.sessionId !== state.sessionId || live.missionId !== state.missionId || live.version !== state.version;
  const canAct = live.status !== 'active';
  const next = state.missionId === 'P1' ? 'P2' : state.missionId === 'P2' ? 'B1' : null;
  const weak = state.debrief ? Object.entries(state.debrief.tracks).filter(([track, skill]) => track !== 'repair' && (skill.independentCount === 0 || skill.mastery < 0.65)).map(([track]) => track) : [];
  const vocab = vocabFor(state.missionId);
  const start = (missionId: MissionId) => void onAction({ type: 'startMission', missionId }).catch(() => undefined);
  return <section className="result-panel" role="dialog" aria-labelledby="result-title" data-testid="result-panel" data-review={review}>
    <button ref={close} type="button" className="button secondary result-close" onClick={onClose} aria-label="Close results">✕</button>
    <span className="eyebrow">{state.validationMode ? 'SIMULATED RESULT · NO PLAYER ACHIEVEMENT' : review ? 'MISSION REVIEW' : 'ATTEMPT COMPLETE'}</span>
    <h2 id="result-title">{state.status === 'cleared' ? 'You found your way.' : 'Try a fresh route.'}</h2>
    <p>{missionTitles[state.missionId]} · {state.status === 'cleared' ? 'The server confirmed the required objectives.' : 'This attempt ended. Your next attempt starts with fresh mission state.'}</p>
    <ul className="result-objectives" aria-label="Quest summary">{state.objectives.map((objective) => <li key={objective.id}><input type="checkbox" checked={objective.complete} readOnly tabIndex={-1} aria-label={objective.label} /><span>{objective.label}</span></li>)}</ul>
    {state.badges.map((badge) => <span className="earned-badge" key={badge}>{state.validationMode ? 'Simulated badge: ' : 'Badge: '}{badge === 'station-navigator' ? 'Station Navigator' : badge}</span>)}
    <div className="result-actions">
      {canAct && !review && state.status === 'cleared' && next && <button className="button primary" disabled={pending} onClick={() => start(next)}>{next === 'B1' ? 'Enter boss mission' : 'Next practice mission'}</button>}
      {canAct && state.status === 'cleared' && <button className="button secondary" disabled={pending} onClick={() => start(state.missionId)}>Play again</button>}
      {canAct && state.status === 'failed' && <button className="button primary" disabled={pending} onClick={() => review ? start(state.missionId) : void onAction({ type: 'retryMission' }).catch(() => undefined)}>Retry mission</button>}
      {canAct && state.status === 'failed' && state.mode === 'boss' && <button className="button secondary" disabled={pending} onClick={() => start(state.debrief?.nextPracticeMissionId ?? 'P2')}>Return to practice</button>}
      {canAct && <button className="button secondary" disabled={pending} onClick={onExit}>Return to start</button>}
      <button className="button secondary" disabled={pending} onClick={onClose}>{canAct ? 'Close' : 'Back to mission'}</button>
    </div>
    <section className="vocab-review" aria-label="Vocab to study" data-testid="vocab-review">
      <h3>Vocab to study</h3>
      {weak.length > 0 && <p>Focus: {weak.join(', ')}.</p>}
      <dl>{vocab.map((entry) => <div key={entry.zh} data-focus={weak.includes(entry.kind)}><dt lang="zh-Hans">{entry.zh}</dt><dd>{entry.en}</dd></div>)}</dl>
    </section>
    <SkillDebrief state={state} />
  </section>;
}
