import { languageTag, type PublicState, type TurnResponse } from '@vibequest/shared';

export function CoachPanel({ state, turn }: { state: PublicState; turn: TurnResponse | null }) {
  if (!state.capabilities.coach || !turn) return null;
  return <aside className="coach-panel" data-testid="coach-panel" aria-label="Practice feedback">
    {turn.vibe && <div className="vibe-meter" aria-label="Conversation effectiveness">{Object.entries(turn.vibe).map(([dimension, score]) => <div key={dimension}><span>{dimension === 'intent' ? 'Understood' : dimension === 'clarity' ? 'Clarity' : 'Courtesy'}</span><meter min={0} max={1} value={score} aria-label={dimension} /><span>{Math.round(score * 100)}%</span></div>)}</div>}
    {turn.feedback && <><h3>Pause & Learn</h3><p>{turn.feedback.understood}</p><p>{turn.feedback.explanation}</p><p lang={languageTag(state.language)} className="improved-example">{turn.feedback.improvedExample}</p></>}
  </aside>;
}
