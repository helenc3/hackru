import { useSyncExternalStore } from 'react';
import { ReviewWordSchema, type ReviewWord } from '@vibequest/shared';

// Words the player marked to review. Local to this browser; never sent to the server.
const KEY = 'vibequest.review-words.v1';
const listeners = new Set<() => void>();
let cache: ReviewWord[] | null = null;

function read(): ReviewWord[] {
  if (cache) return cache;
  try {
    const parsed = ReviewWordSchema.array().safeParse(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    cache = parsed.success ? parsed.data : [];
  } catch { cache = []; }
  return cache;
}
function write(next: ReviewWord[]): void {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked: keep in memory */ }
  for (const listener of listeners) listener();
}
export const reviewWords = (): ReviewWord[] => read();
export const hasReviewWord = (simplified: string): boolean => read().some((word) => word.simplified === simplified);
export function addReviewWord(word: Omit<ReviewWord, 'addedAtMs'>): void {
  if (hasReviewWord(word.simplified)) return;
  write([...read(), ReviewWordSchema.parse({ ...word, addedAtMs: Date.now() })]);
}
export function removeReviewWord(simplified: string): void { write(read().filter((word) => word.simplified !== simplified)); }
export function useReviewWords(): ReviewWord[] {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, read, () => []);
}
