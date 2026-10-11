import { useState } from 'react';
import { removeReviewWord, useReviewWords } from './review-list';
import './dictionary.css';

/** HUD button + panel listing words saved for review (this browser only). */
export function ReviewPanel() {
  const words = useReviewWords();
  const [open, setOpen] = useState(false);
  return <div className="review-words">
    <button className="button secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid="review-toggle">Review · {words.length}</button>
    {open && <section className="review-panel" role="dialog" aria-label="Words to review" data-testid="review-panel" data-gloss-ignore=""
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
      <header><h2>Words to review</h2><button className="button secondary" onClick={() => setOpen(false)}>Close</button></header>
      {words.length === 0 ? <p>Shift+click any Chinese text, then choose “Add to review”.</p>
        : <ul>{words.map((word) => <li key={word.simplified} data-testid="review-word">
          <span className="review-hanzi" lang="zh-Hans">{word.simplified}</span>
          <span className="review-pinyin">{word.pinyin}</span>
          <span className="review-english">{word.english.slice(0, 3).join('; ')}</span>
          {word.context && <small lang="zh-Hans">{word.context}</small>}
          <button className="button secondary" onClick={() => removeReviewWord(word.simplified)} aria-label={`Remove ${word.simplified}`}>Remove</button>
        </li>)}</ul>}
    </section>}
  </div>;
}
