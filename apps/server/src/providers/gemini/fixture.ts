import { z } from 'zod';
import {
  TurnContextSchema, validateEvaluationForContext,
  type DialogueProvider, type TurnContext, type TurnEvaluation,
} from '@vibequest/shared';
import { clarificationEvaluation } from './gate.js';
import documentedExamples from '../../../../../fixtures/gemini/language-examples.json' with { type: 'json' };

export const FIXTURE_PROVIDER_LABEL = 'fixture' as const;

const ExampleSchema = z.strictObject({
  id: z.string().min(1), description: z.string().min(1), context: TurnContextSchema,
  playerText: z.string().max(500), designatedValid: z.boolean(), evaluation: z.unknown(),
});
export type LanguageExample = Omit<z.infer<typeof ExampleSchema>, 'evaluation'> & { evaluation: TurnEvaluation };

/** Throws on any fixture that the live adapter's validation would also reject. */
export function loadLanguageExamples(raw: unknown = documentedExamples): LanguageExample[] {
  return z.array(ExampleSchema).parse(raw).map((example) => ({
    ...example,
    evaluation: validateEvaluationForContext(example.evaluation, example.context, example.playerText),
  }));
}

export function normalizeFixtureText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[。？！.?!]+$/u, '');
}

const keyOf = (npcId: string, mode: string, text: string) => `${npcId}|${mode}|${normalizeFixtureText(text)}`;

// Recognizes documented phrases only; it never claims to understand novel language.
function clarification(context: TurnContext): TurnEvaluation {
  const evaluation = clarificationEvaluation(context);
  if (evaluation.coach) evaluation.coach.understood = 'Fixture mode only recognizes documented example phrases.';
  return evaluation;
}

export function createFixtureDialogueProvider(
  examples: LanguageExample[] = loadLanguageExamples(),
): DialogueProvider & { label: typeof FIXTURE_PROVIDER_LABEL } {
  const byKey = new Map(examples.map((example) =>
    [keyOf(example.context.npcId, example.context.mode, example.playerText), example.evaluation]));
  return {
    label: FIXTURE_PROVIDER_LABEL,
    evaluate: (context, playerText) => {
      const stored = byKey.get(keyOf(context.npcId, context.mode, playerText));
      return Promise.resolve(stored ? structuredClone(stored) : clarification(context));
    },
  };
}
