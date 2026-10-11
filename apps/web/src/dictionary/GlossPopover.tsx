import { useEffect, useRef, useState } from 'react';
import type { AnnotateResponse } from '@vibequest/shared';
import { annotate, glossAt, tokenIndexAt } from './gloss';
import { addReviewWord, removeReviewWord, useReviewWords } from './review-list';
import './dictionary.css';

type Open = { x: number; y: number; text: string; offset: number; restore: Element | null };
let openFromElement: ((element: HTMLElement) => void) | null = null;
/** Keyboard path: gloss a whole element (e.g. an NPC reply's Explain button). */
export const explainElement = (element: HTMLElement): void => openFromElement?.(element);

/** Shift+click any Chinese text for pinyin, glosses and the line's translation. Mount once. */
export function GlossPopover() {
  const [open, setOpen] = useState<Open | null>(null);
  const [result, setResult] = useState<AnnotateResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const review = useReviewWords();

  useEffect(() => {
    const show = (next: Open) => { setOpen(next); setResult(null); setFailed(false); };
    openFromElement = (element) => {
      const rect = element.getBoundingClientRect();
      const text = element.textContent ?? '';
      show({ x: rect.left, y: rect.bottom, text, offset: Math.max(0, [...text].findIndex((char) => /\p{Script=Han}/u.test(char))), restore: document.activeElement });
    };
    // Capture phase on window runs before React's root listeners, so Shift+click never reaches
    // the element's own handler (send, NPC interact, click-to-walk) and never selects text.
    const swallow = (event: MouseEvent) => {
      if (!event.shiftKey || event.button !== 0 || panel.current?.contains(event.target as Node)) return false;
      const hit = glossAt(event.clientX, event.clientY);
      if (!hit) return false;
      event.preventDefault(); event.stopImmediatePropagation();
      return hit;
    };
    const onPointerDown = (event: PointerEvent) => {
      const hit = swallow(event);
      if (hit) show({ x: event.clientX, y: event.clientY, text: hit.text, offset: hit.offset, restore: document.activeElement });
      else if (!panel.current?.contains(event.target as Node)) setOpen(null);
    };
    const onMouse = (event: MouseEvent) => { swallow(event); };
    window.addEventListener('pointerdown', onPointerDown, true);
    for (const type of ['mousedown', 'mouseup', 'click'] as const) window.addEventListener(type, onMouse, true);
    return () => {
      openFromElement = null;
      window.removeEventListener('pointerdown', onPointerDown, true);
      for (const type of ['mousedown', 'mouseup', 'click'] as const) window.removeEventListener(type, onMouse, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const lead = open.text.length - open.text.trimStart().length;
    annotate(open.text).then((response) => {
      if (!live) return;
      setResult(response);
      setSelected(tokenIndexAt(response.tokens, Math.max(0, open.offset - lead)));
    }, () => { if (live) setFailed(true); });
    panel.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation(); // Esc closes the gloss, not the conversation underneath.
      setOpen(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => { live = false; window.removeEventListener('keydown', onKey, true); };
  }, [open]);

  // Hand focus back (e.g. to the world, so WASD keeps working) when the popover closes.
  const restore = useRef<Element | null>(null);
  useEffect(() => {
    if (open) { restore.current = open.restore; return; }
    if (restore.current instanceof HTMLElement && restore.current.isConnected) restore.current.focus({ preventScroll: true });
    restore.current = null;
  }, [open]);

  if (!open) return null;
  const token = result?.tokens[selected];
  const entry = token?.entries?.[0];
  const saved = entry && review.some((word) => word.simplified === entry.simplified);
  const left = Math.max(8, Math.min(open.x, window.innerWidth - 340));
  const below = open.y + 12 < window.innerHeight - 260;
  return <div ref={panel} className="gloss-popover" role="dialog" aria-label="Word explanation" tabIndex={-1} data-testid="gloss-popover" data-gloss-ignore=""
    style={below ? { left, top: open.y + 12 } : { left, bottom: window.innerHeight - open.y + 12 }}>
    <button className="gloss-close" onClick={() => setOpen(null)} aria-label="Close explanation">×</button>
    {failed ? <p role="alert">The dictionary is unavailable. Try again.</p> : !result ? <p>Looking up…</p> : <>
      <p className="gloss-line" lang="zh-Hans">{result.tokens.map((part, index) => part.entries?.length
        ? <button key={index} className="gloss-token" aria-pressed={index === selected} onClick={() => setSelected(index)}>{part.text}</button>
        : <span key={index}>{part.text}</span>)}</p>
      <p className="gloss-pinyin" data-testid="gloss-line-pinyin">{result.pinyin}</p>
      {result.translation && <p className="gloss-translation" data-testid="gloss-translation">{result.translation}</p>}
      {token && entry ? <section className="gloss-word" data-testid="gloss-word">
        <h3><span lang="zh-Hans">{entry.simplified}</span> <span className="gloss-word-pinyin">{entry.pinyin}</span></h3>
        <ul>{token.entries!.flatMap((item) => item.english).slice(0, 4).map((meaning) => <li key={meaning}>{meaning}</li>)}</ul>
        <button className="button secondary" data-testid="gloss-review-toggle" aria-pressed={Boolean(saved)}
          onClick={() => saved ? removeReviewWord(entry.simplified) : addReviewWord({ simplified: entry.simplified, pinyin: entry.pinyin, english: entry.english, context: open.text.trim().slice(0, 240) })}>
          {saved ? 'In review ✓' : 'Add to review'}
        </button>
      </section> : <p className="gloss-hint">Choose a word above.</p>}
    </>}
  </div>;
}
