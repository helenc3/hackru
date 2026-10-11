import { describe, expect, it } from 'vitest';
import { baselineTurnContext, malformedEvaluation, validateEvaluationForContext } from '@vibequest/shared';
import { createFixtureDialogueProvider, loadLanguageExamples } from '../../../src/providers/gemini/fixture.js';
import { meetsProgressionGate } from '../../../src/providers/gemini/gate.js';

const examples = loadLanguageExamples();
const provider = createFixtureDialogueProvider(examples);
const byId = (id: string) => {
  const example = examples.find((candidate) => candidate.id === id);
  if (!example) throw new Error(`missing fixture ${id}`);
  return example;
};

describe('fixture dialogue provider', () => {
  it('documents at least 12 valid examples, each passing context validation through the provider', async () => {
    expect(examples.length).toBeGreaterThanOrEqual(12);
    expect(provider.label).toBe('fixture');
    for (const example of examples) {
      const evaluation = await provider.evaluate(example.context, example.playerText);
      expect(evaluation, example.id).toEqual(example.evaluation);
      expect(() => validateEvaluationForContext(evaluation, example.context, example.playerText)).not.toThrow();
      expect(evaluation.replyZh.length).toBeLessThanOrEqual(80);
    }
  });

  it('accepts at least 5 of 6 designated valid Mandarin intents', async () => {
    const designated = examples.filter((example) => example.designatedValid);
    expect(designated).toHaveLength(6);
    const passed = await Promise.all(designated.map(async (example) =>
      meetsProgressionGate(await provider.evaluate(example.context, example.playerText))));
    expect(passed.filter(Boolean).length).toBeGreaterThanOrEqual(5);
  });

  it('English-only input never satisfies the Mandarin gate', () => {
    const english = byId('q1-english-only').evaluation;
    expect(english.targetLanguageUse).toBe('no');
    expect(meetsProgressionGate(english)).toBe(false);
  });

  it('prompt injection yields no slots and no progression', () => {
    for (const id of ['q1-injection-zh', 'q2-injection-en']) {
      const evaluation = byId(id).evaluation;
      expect(evaluation.slots).toEqual([]);
      expect(evaluation.intent).toBe('unknown');
      expect(meetsProgressionGate(evaluation)).toBe(false);
    }
  });

  it('covers all three quest roles, including an unroutable destination', () => {
    expect(new Set(examples.map((example) => example.context.npcId))).toEqual(new Set(['vendor', 'guide', 'passerby']));
    expect(byId('q2-other-place').evaluation.slots).toEqual([{ key: 'destination', value: 'other' }]);
    expect(byId('q3-photo').evaluation).toMatchObject({ intent: 'request_photo', slots: [] });
  });

  it('undocumented input gets a labeled clarification, not invented comprehension', async () => {
    const practice = await provider.evaluate(baselineTurnContext, '我想去月球。');
    expect(practice).toMatchObject({ intent: 'unknown', slots: [], evidenceQuote: '', targetLanguageUse: 'uncertain' });
    expect(practice.coach?.understood).toMatch(/fixture/i);
    expect(meetsProgressionGate(practice)).toBe(false);
    // The same documented text from a different NPC is not a documented request.
    const otherNpc = await provider.evaluate(baselineTurnContext, '请问，去上海大酒店怎么走？');
    expect(otherNpc.intent).toBe('unknown');
  });

  it('matches documented phrases despite trailing punctuation and spacing', async () => {
    const tea = byId('q1-short-tea');
    expect((await provider.evaluate(tea.context, '  茶。 ')).slots).toEqual([{ key: 'drink', value: 'tea' }]);
  });

  it('returns copies so callers cannot mutate the fixture', async () => {
    const tea = byId('q1-short-tea');
    const first = await provider.evaluate(tea.context, tea.playerText);
    first.slots.length = 0;
    expect((await provider.evaluate(tea.context, tea.playerText)).slots).toHaveLength(1);
  });

  it('rejects the malformed baseline evaluation and invented slots', () => {
    expect(() => validateEvaluationForContext(malformedEvaluation, baselineTurnContext, '一杯茶')).toThrow();
    const invented = { ...byId('q1-short-tea').evaluation, slots: [{ key: 'drink', value: 'beer' }] };
    expect(() => validateEvaluationForContext(invented, baselineTurnContext, '茶')).toThrow();
  });

  it('rejects a bad fixture file at load time', () => {
    const [first] = examples;
    expect(() => loadLanguageExamples([{ ...first, evaluation: { ...first.evaluation, evidenceQuote: 'not in text' } }])).toThrow();
  });
});
