import type { Directions } from '@vibequest/shared';

/** Server-verified route to 上海大酒店 from the committed street graph (Q2). Never model text. */
export function DirectionsCard({ directions, pending, onRepeat, showTranscripts = true }: { directions: Directions; pending: boolean; onRepeat: () => void; showTranscripts?: boolean }) {
  return <section className="directions-card" aria-label="Directions to the Shanghai Grand Hotel" data-testid="directions-card">
    <span className="eyebrow">DIRECTIONS · <span lang="zh-Hans">上海大酒店</span></span>
    {showTranscripts && <><p lang="zh-Hans" className="directions-zh">{directions.textZh}</p>
    <ol>{directions.steps.map((step, index) => <li key={index}><span lang="zh-Hans">{step.textZh}</span><small>{step.english}</small></li>)}</ol></>}
    <button type="button" className="button secondary" disabled={pending} onClick={onRepeat}>Ask them to repeat</button>
  </section>;
}
