import { directionsText, languageTag, type Directions, type GameLanguage } from '@vibequest/shared';

/** Server-verified route to 上海大酒店 from the committed street graph (Q2). Never model text. */
export function DirectionsCard({ directions, pending, onRepeat, language = 'zh' }: { directions: Directions; pending: boolean; onRepeat: () => void; language?: GameLanguage }) {
  return <section className="directions-card" aria-label="Directions to the Shanghai Grand Hotel" data-testid="directions-card">
    <span className="eyebrow">DIRECTIONS · <span lang={languageTag(language)}>{language === 'en' ? 'Shanghai Grand Hotel' : '上海大酒店'}</span></span>
    <p lang={languageTag(language)} className="directions-zh">{directionsText(directions, language)}</p>
    <ol>{directions.steps.map((step, index) => <li key={index}><span lang={languageTag(language)}>{language === 'en' ? step.english : step.textZh}</span>{language !== 'en' && <small>{step.english}</small>}</li>)}</ol>
    <button type="button" className="button secondary" disabled={pending} onClick={onRepeat}>Ask them to repeat</button>
  </section>;
}
