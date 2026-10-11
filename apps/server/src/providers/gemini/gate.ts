import type { NpcId, TurnContext, TurnEvaluation } from '@vibequest/shared';

const CLARIFY: Record<NpcId, string> = {
  vendor: '啊？你要喝点什么？',
  guide: '啊？你要去哪儿？',
  passerby: '嗯？什么事？',
};
const EXAMPLE: Record<NpcId, string> = { vendor: '请给我一杯茶。', guide: '请问，去上海大酒店怎么走？', passerby: '可以帮我在这里拍张照吗？' };

/** Safe no-transition evaluation: an in-character clarification (coaching stays in `coach`) that grants nothing. */
export function clarificationEvaluation(context: TurnContext): TurnEvaluation {
  return {
    intent: 'unknown', slots: [], evidenceQuote: '',
    intentGrade: { score: 0, confidence: 0 }, clarity: 0, courtesy: 0.5,
    targetLanguageUse: 'uncertain', interaction: 'relevant',
    replyZh: CLARIFY[context.npcId],
    coach: {
      understood: 'I could not tell what you meant.',
      explanation: 'Try one short Mandarin sentence that says what you want.',
      improvedExample: EXAMPLE[context.npcId],
    },
  };
}
