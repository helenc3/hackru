import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DictionaryEntrySchema, type AnnotatedToken, type DictionaryEntry } from '@vibequest/shared';
import { HttpError } from '../errors.js';

// CC-CEDICT (CC BY-SA 4.0) via the data-only `cedict-json` package. Read from disk on first use
// rather than imported, so the 16 MB JSON never lands in the server bundle.
type RawEntry = { traditional: string; simplified: string; pinyin: string; english: string[] };
type Dictionary = { byWord: Map<string, DictionaryEntry[]>; byPinyin: Map<string, DictionaryEntry[]>; all: DictionaryEntry[] };

const MAX_WORD_LENGTH = 6;
const MARKS: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
const UNMARK = new Map(Object.entries(MARKS).flatMap(([vowel, marked]) => [...marked].map((char, tone) => [char, [vowel, tone + 1] as const])));
const HAN = /\p{Script=Han}/u;

/** CEDICT numbered syllable (ni3, lu:4, Wang2, r5) → tone-marked (nǐ, lǜ, Wáng, r). Non-syllables pass through. */
export function markSyllable(raw: string): string {
  const match = /^([A-Za-z:]+)([1-5])$/.exec(raw);
  if (!match) return raw.replace(/u:/g, 'ü').replace(/U:/g, 'Ü');
  const syllable = match[1]!.replace(/u:/g, 'ü').replace(/U:/g, 'Ü');
  const tone = Number(match[2]);
  if (tone === 5) return syllable;
  const lower = syllable.toLowerCase();
  const index = lower.includes('a') ? lower.indexOf('a') : lower.includes('e') ? lower.indexOf('e') : lower.includes('ou') ? lower.indexOf('o')
    : Math.max(...[...'iouü'].map((vowel) => lower.lastIndexOf(vowel)));
  if (index < 0) return syllable;
  const original = syllable[index]!;
  const marked = MARKS[original.toLowerCase()]![tone - 1]!;
  return syllable.slice(0, index) + (original === original.toLowerCase() ? marked : marked.toUpperCase()) + syllable.slice(index + 1);
}
const markPinyin = (numbered: string): string => numbered.split(' ').map(markSyllable).join(' ');

/** Index keys: tone-marked (shuǐ), numbered (shui3) and bare (shui); ü is v in the ASCII keys. */
function pinyinKeys(numbered: string, marked: string): string[] {
  const ascii = numbered.toLowerCase().replace(/u:/g, 'v').replace(/[\s·,]/g, '');
  return [...new Set([marked.toLowerCase().replace(/[\s·,]/g, ''), ascii, ascii.replace(/[1-5]/g, '')])];
}
/** Normalize a pinyin query to the same key space; tone-marked input keeps its marks. */
function pinyinQueryKey(query: string): string {
  const lower = query.toLowerCase().replace(/'/g, '');
  return [...lower].some((char) => UNMARK.has(char)) ? lower : lower.replace(/ü/g, 'v');
}

// Common readings first: CEDICT lists surnames/proper nouns (capitalized pinyin) beside common words.
const commonFirst = (a: DictionaryEntry, b: DictionaryEntry) => Number(/^[A-Z]/.test(a.pinyin)) - Number(/^[A-Z]/.test(b.pinyin));
const commonness = new WeakMap<DictionaryEntry, number>();
const byUsage = (a: DictionaryEntry, b: DictionaryEntry) => (commonness.get(b) ?? 0) - (commonness.get(a) ?? 0);

let loaded: Dictionary | undefined;
export function dictionary(): Dictionary {
  if (loaded) return loaded;
  const file = join(dirname(createRequire(import.meta.url).resolve('cedict-json')), 'cedict.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as RawEntry[];
  const byWord = new Map<string, DictionaryEntry[]>();
  const byPinyin = new Map<string, DictionaryEntry[]>();
  const all: DictionaryEntry[] = [];
  const push = (map: Map<string, DictionaryEntry[]>, key: string, entry: DictionaryEntry) => { const list = map.get(key); if (list) list.push(entry); else map.set(key, [entry]); };
  for (const item of raw) {
    const entry = DictionaryEntrySchema.safeParse({ simplified: item.simplified, traditional: item.traditional, pinyin: markPinyin(item.pinyin), english: item.english.slice(0, 12).map((gloss) => gloss.slice(0, 200)) });
    if (!entry.success) continue; // over-long idioms and empty glosses fall outside the contract
    all.push(entry.data);
    push(byWord, item.simplified, entry.data);
    if (item.traditional !== item.simplified) push(byWord, item.traditional, entry.data);
    for (const key of pinyinKeys(item.pinyin, entry.data.pinyin)) push(byPinyin, key, entry.data);
  }
  // CEDICT has no frequencies; how often a character recurs across headwords is a usable commonness proxy (水 ≫ 帨).
  const usage = new Map<string, number>();
  for (const entry of all) for (const char of entry.simplified) usage.set(char, (usage.get(char) ?? 0) + 1);
  for (const entry of all) commonness.set(entry, Math.min(...[...entry.simplified].map((char) => usage.get(char) ?? 0)));
  for (const list of byWord.values()) list.sort(commonFirst);
  for (const list of byPinyin.values()) list.sort((a, b) => commonFirst(a, b) || [...a.simplified].length - [...b.simplified].length || byUsage(a, b));
  loaded = { byWord, byPinyin, all };
  return loaded;
}

/** Greedy longest match over headwords; unknown Han characters become single-character tokens. */
export function segment(text: string): AnnotatedToken[] {
  const { byWord } = dictionary();
  const chars = [...text];
  const tokens: AnnotatedToken[] = [];
  for (let i = 0; i < chars.length;) {
    if (!HAN.test(chars[i]!)) {
      let end = i;
      while (end < chars.length && !HAN.test(chars[end]!) && end - i < 40) end++;
      tokens.push({ text: chars.slice(i, end).join('') });
      i = end; continue;
    }
    let length = Math.min(MAX_WORD_LENGTH, chars.length - i);
    while (length > 1 && !byWord.has(chars.slice(i, i + length).join(''))) length--;
    const word = chars.slice(i, i + length).join('');
    const entries = byWord.get(word);
    tokens.push(entries ? { text: word, pinyin: entries[0]!.pinyin.replace(/ /g, ''), entries: entries.slice(0, 6) } : { text: word });
    i += length;
  }
  return tokens;
}

const PUNCTUATION: Record<string, string> = { '，': ',', '。': '.', '！': '!', '？': '?', '：': ':', '；': ';', '、': ',', '（': '(', '）': ')', '“': '"', '”': '"', '…': '…', '\n': ' ' };
/** Whole-line pinyin: words separated by spaces, Chinese punctuation shown as Latin punctuation. */
export function linePinyin(tokens: AnnotatedToken[]): string {
  let line = '';
  for (const token of tokens) {
    const part = token.pinyin ?? [...token.text].map((char) => PUNCTUATION[char] ?? char).join('');
    const word = Boolean(token.pinyin) || HAN.test(token.text);
    line += word && line && !/[\s("]$/.test(line) ? ` ${part}` : part;
  }
  return line.replace(/([,.!?:;])(?=\S)/g, '$1 ').replace(/\s+/g, ' ').trim();
}

const phrase = () => new HttpError(422, 'PHRASE_NOT_ALLOWED', 'Look up one word at a time, not a phrase or sentence.');

/** Single-word lookup by Hanzi headword, pinyin word, or one English word. */
export function lookup(query: string): DictionaryEntry[] {
  const { byWord, byPinyin, all } = dictionary();
  // Internal apostrophes/hyphens are word-internal (xi'an, e-mail); anything else separates words.
  if (/[\s\p{P}\p{S}]/u.test(query.replace(/(?<=\p{L})['’-](?=\p{L})/gu, ''))) throw phrase();
  if (HAN.test(query)) {
    if (![...query].every((char) => HAN.test(char))) throw phrase();
    const exact = byWord.get(query);
    if (exact) return exact.slice(0, 20);
    if (segment(query).length > 1) throw phrase();
    return [];
  }
  const results = [...(byPinyin.get(pinyinQueryKey(query)) ?? [])];
  if (/^[a-z'’-]+$/i.test(query)) {
    // ponytail: linear scan of ~120k glosses (a few ms); build an inverted index if lookups get hot.
    const word = query.toLowerCase();
    const whole = new RegExp(`(^|[^a-z])${word.replace(/[-']/g, '\\$&')}([^a-z]|$)`, 'i');
    const bare = (gloss: string) => gloss.toLowerCase().replace(/\([^)]*\)/g, '').replace(/^to /, '').trim();
    const ranked: { entry: DictionaryEntry; rank: number }[] = [];
    for (const entry of all) {
      const index = entry.english.findIndex((gloss) => whole.test(gloss));
      if (index < 0) continue;
      const exact = entry.english.findIndex((gloss) => bare(gloss) === word);
      // Exact gloss beats a mention; then the earlier (primary) sense; then shorter, more basic words.
      ranked.push({ entry, rank: (exact >= 0 ? exact : 100 + index) * 10 + [...entry.simplified].length });
    }
    ranked.sort((a, b) => a.rank - b.rank || commonFirst(a.entry, b.entry) || byUsage(a.entry, b.entry));
    for (const { entry } of ranked) if (!results.includes(entry)) results.push(entry);
  }
  return results.slice(0, 20);
}
