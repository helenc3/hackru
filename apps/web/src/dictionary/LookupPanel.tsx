import { useEffect, useRef, useState } from 'react';
import type { DictionaryEntry } from '@vibequest/shared';
import { DictionaryError, lookupWord } from './client';
import { addReviewWord, removeReviewWord, useReviewWords } from './review-list';
import { focusWorld } from '../app/focus-world';
import './lookup.css';

const SINGLE_WORDS = 'Single words only — try 水 or water.';
// One Hanzi word, one pinyin word (tone marks or digits) or one English word. Spaces or punctuation mean a phrase.
const ONE_WORD = /^(?:\p{Script=Han}+|[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ]+[1-5]?(?:[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ]+[1-5]?)*)$/u;

type Result = { status: 'idle' | 'loading' } | { status: 'done'; query: string; entries: DictionaryEntry[] } | { status: 'error'; message: string };

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Pocket dictionary: HUD toggle, "/" shortcut, single-word search with add-to-review. Never touches game state. */
export function LookupPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>({ status: 'idle' });
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const review = useReviewWords();
  const trimmed = query.trim();
  const phrase = trimmed !== '' && !ONE_WORD.test(trimmed);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      event.preventDefault(); setOpen(true);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);

  // Debounced, latest-wins search. Phrases detectable here never reach the server.
  useEffect(() => {
    if (!open || !trimmed || phrase) { setResult({ status: 'idle' }); return; }
    let live = true;
    setResult({ status: 'loading' });
    const timer = setTimeout(() => {
      lookupWord(trimmed).then((response) => { if (live) setResult({ status: 'done', query: response.query, entries: response.entries }); })
        .catch((error: unknown) => { if (live) setResult({ status: 'error', message: error instanceof DictionaryError ? error.message : 'The dictionary is unavailable. Try again.' }); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [open, trimmed, phrase]);

  const close = () => { setOpen(false); focusWorld(); };
  const move = (from: Element | null, step: 1 | -1) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = from instanceof HTMLButtonElement ? buttons.indexOf(from) : -1;
    const next = index + step;
    if (next < 0) input.current?.focus(); else buttons[Math.min(next, buttons.length - 1)]?.focus();
  };

  return <>
    <button className="button secondary topbar-icon" aria-label="Dictionary" title="Dictionary ( / )" aria-expanded={open} data-testid="lookup-toggle" onClick={() => (open ? close() : setOpen(true))}>字</button>
    {open && <section className="lookup-panel" role="dialog" aria-label="Dictionary" data-testid="lookup-panel"
      // Keys typed here belong to the panel: never to world movement or global shortcuts.
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); close(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(document.activeElement, event.key === 'ArrowDown' ? 1 : -1); }
      }}>
      <header><h2>Dictionary</h2><button className="button secondary" onClick={close} aria-label="Close dictionary">Close</button></header>
      <input ref={input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="水 · shui3 · water" aria-label="Look up one word" autoComplete="off" spellCheck={false} lang="zh-Hans" />
      <div className="lookup-status" aria-live="polite">
        {phrase ? <p data-testid="lookup-phrase">{SINGLE_WORDS}</p>
          : result.status === 'loading' ? <p>Looking up…</p>
            : result.status === 'error' ? <p role="alert" data-testid="lookup-error">{result.message}</p>
              : result.status === 'done' && !result.entries.length ? <p data-testid="lookup-empty">No match for “{result.query}”.</p>
                : result.status === 'idle' && !trimmed ? <p>Type one word in Chinese, pinyin or English.</p> : null}
      </div>
      {result.status === 'done' && result.entries.length > 0 && !phrase && <ol ref={list} className="lookup-results" data-testid="lookup-results">
        {result.entries.map((entry) => {
          const saved = review.some((word) => word.simplified === entry.simplified);
          return <li key={`${entry.simplified}|${entry.pinyin}`} data-testid="lookup-entry">
            <span className="lookup-hanzi" lang="zh-Hans">{entry.simplified}{entry.traditional !== entry.simplified && <small lang="zh-Hant"> {entry.traditional}</small>}</span>
            <span className="lookup-pinyin">{entry.pinyin}</span>
            <span className="lookup-english">{entry.english.join('; ')}</span>
            <button className="button secondary" aria-pressed={saved} onClick={() => (saved ? removeReviewWord(entry.simplified) : addReviewWord({ simplified: entry.simplified, pinyin: entry.pinyin, english: entry.english }))}>{saved ? 'In review ✓' : 'Add to review'}</button>
          </li>;
        })}
      </ol>}
    </section>}
  </>;
}
