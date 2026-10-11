import { z } from 'zod';

// Dictionary contract (word lookup, shift-click annotation, review list). Glosses come from a
// bundled dictionary; the dictionary never affects game progress or skill evidence.
export const DictionaryEntrySchema = z.strictObject({
  simplified: z.string().min(1).max(40), traditional: z.string().min(1).max(40),
  /** Tone-marked pinyin, e.g. "shuǐ". */
  pinyin: z.string().min(1).max(120),
  english: z.array(z.string().min(1).max(200)).min(1).max(12),
});
export type DictionaryEntry = z.infer<typeof DictionaryEntrySchema>;

/**
 * GET /api/dictionary/lookup?q=… — single words only. q is one Hanzi headword, one pinyin word
 * (tone marks, tone numbers or none; no spaces) or one English word. Anything that segments into
 * more than one word, or contains spaces/punctuation, is rejected with 422 PHRASE_NOT_ALLOWED.
 */
export const LookupQuerySchema = z.string().trim().min(1).max(24);
export const LookupResponseSchema = z.strictObject({ query: z.string(), entries: z.array(DictionaryEntrySchema).max(20) });
export type LookupResponse = z.infer<typeof LookupResponseSchema>;

/** POST /api/dictionary/annotate — segment visible text for shift-click glosses. */
export const AnnotateRequestSchema = z.strictObject({ text: z.string().min(1).max(500) });
export const AnnotatedTokenSchema = z.strictObject({
  text: z.string().min(1).max(40),
  /** Absent for punctuation, digits, Latin text. */
  pinyin: z.string().max(120).optional(),
  entries: z.array(DictionaryEntrySchema).max(6).optional(),
});
export type AnnotatedToken = z.infer<typeof AnnotatedTokenSchema>;
export const AnnotateResponseSchema = z.strictObject({
  tokens: z.array(AnnotatedTokenSchema).max(300),
  /** Whole-line tone-marked pinyin. */
  pinyin: z.string().max(2000),
  /** English for the whole line when available. */
  translation: z.string().max(600).optional(),
  translationSource: z.enum(['authored', 'claude', 'none']),
});
export type AnnotateResponse = z.infer<typeof AnnotateResponseSchema>;

/** Client-side review list item (localStorage 'vibequest.review-words.v1'). */
export const ReviewWordSchema = z.strictObject({
  simplified: z.string().min(1).max(40), pinyin: z.string().min(1).max(120), english: z.array(z.string().max(200)).min(1).max(12),
  addedAtMs: z.number().int().min(0), context: z.string().max(240).optional(),
});
export type ReviewWord = z.infer<typeof ReviewWordSchema>;
