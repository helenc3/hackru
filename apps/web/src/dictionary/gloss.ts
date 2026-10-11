import type { AnnotateResponse, AnnotatedToken } from '@vibequest/shared';
import { annotateText } from './client';

/** Chinese text opts in via lang="zh-Hans" (or data-gloss for text without a lang). */
export const GLOSSABLE = '[lang="zh-Hans"], [data-gloss]';
const HAN = /\p{Script=Han}/u;

/**
 * The glossable element and character offset under a screen point. Hit-tests by rendered rects,
 * not elementFromPoint, so world labels with pointer-events: none still count. The innermost
 * matching element wins (a bubble inside a lang="zh-Hans" panel).
 */
export function glossAt(x: number, y: number, root: ParentNode = document): { element: HTMLElement; text: string; offset: number } | null {
  const inside = (rect: DOMRect) => rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const candidates = [...root.querySelectorAll<HTMLElement>(GLOSSABLE)].filter((element) => !element.closest('[data-gloss-ignore]') && HAN.test(element.textContent ?? '') && inside(element.getBoundingClientRect()));
  const element = candidates.find((candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)));
  if (!element) return null;
  const text = element.textContent ?? '';
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let offset = 0;
  // ponytail: per-character rect scan, fine for ≤500-char lines; caretPositionFromPoint can't see pointer-events: none labels.
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    for (let i = 0; i < length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      if ([...range.getClientRects()].some(inside)) return { element, text, offset: offset + i };
    }
    offset += length;
  }
  // The point is inside the element but between glyphs (padding): take the first Han character.
  return { element, text, offset: Math.max(0, [...text].findIndex((char) => HAN.test(char))) };
}

/** Index of the token covering a UTF-16 offset into the joined token text. */
export function tokenIndexAt(tokens: readonly AnnotatedToken[], offset: number): number {
  let end = 0;
  for (const [index, token] of tokens.entries()) {
    end += token.text.length;
    if (offset < end) return index;
  }
  return tokens.length - 1;
}

const cache = new Map<string, Promise<AnnotateResponse>>();
/** One request per distinct line; failures are not cached so a retry can succeed. */
export function annotate(text: string): Promise<AnnotateResponse> {
  const key = text.trim().slice(0, 500);
  let pending = cache.get(key);
  if (!pending) {
    pending = annotateText(key);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}
