import type { PublicState, RendererProps } from '@vibequest/shared';
import { SkillDebrief } from './SkillDebrief';

export function ResultPanel({ state, pending, onAction, onExit }: { state: PublicState; pending: boolean; onAction: RendererProps['onAction']; onExit: () => void }) {
  if (state.status === 'active') return null;
  const next = state.missionId === 'P1' ? 'P2' : state.missionId === 'P2' ? 'B1' : null;
  return <section className="result-panel" role="dialog" aria-labelledby="result-title" data-testid="result-panel">
    <span className="eyebrow">{state.validationMode ? 'SIMULATED RESULT · NO PLAYER ACHIEVEMENT' : 'ATTEMPT COMPLETE'}</span>
    <h2 id="result-title">{state.status === 'cleared' ? 'You found your way.' : 'Try a fresh route.'}</h2>
    <p>{state.status === 'cleared' ? 'The server confirmed the required objectives.' : 'This attempt ended. Your next attempt starts with fresh mission state.'}</p>
    {state.badges.map((badge) => <span className="earned-badge" key={badge}>{state.validationMode ? 'Simulated badge: ' : 'Badge: '}{badge === 'station-navigator' ? 'Station Navigator' : badge}</span>)}
    <SkillDebrief state={state} />
    <div className="result-actions">
      {state.status === 'cleared' && next && <button className="button primary" disabled={pending} onClick={() => void onAction({ type: 'startMission', missionId: next }).catch(() => undefined)}>{next === 'B1' ? 'Enter boss mission' : 'Next practice mission'}</button>}
      {state.status === 'failed' && <button className="button primary" disabled={pending} onClick={() => void onAction({ type: 'retryMission' }).catch(() => undefined)}>Retry mission</button>}
      {state.status === 'failed' && state.mode === 'boss' && <button className="button secondary" disabled={pending} onClick={() => void onAction({ type: 'startMission', missionId: 'P2' }).catch(() => undefined)}>Return to practice</button>}
      <button className="button secondary" disabled={pending} onClick={onExit}>Return to start</button>
    </div>
  </section>;
}
