import type { Intent, NpcId, TurnContext, TurnEvaluation } from '@vibequest/shared';

const NON_PROGRESSION: readonly Intent[] = ['unknown', 'greeting', 'request_repeat'];

/** Spec §8 threshold for an evaluation that may drive a state transition. Engine guards still apply. */
export function meetsProgressionGate(e: TurnEvaluation): boolean {
  return !NON_PROGRESSION.includes(e.intent)
    && e.interaction === 'relevant'
    && e.evidenceQuote.trim() !== ''
    && e.intentGrade.score >= 0.7
    && e.intentGrade.confidence >= 0.75
    && (e.targetLanguageUse === 'yes' || e.targetLanguageUse === 'mixed');
}

const CLARIFY: Record<NpcId, string> = {
  xiaolin: '不好意思，我没听懂。您想喝点什么？',
  achen: '不好意思，请再说一遍？您要去哪儿？',
  laozhou: '请再说清楚一点。您要买去哪儿的票？',
};

/** Safe no-transition evaluation: asks for clarification and grants nothing. */
export function clarificationEvaluation(context: TurnContext, _playerText?: string): TurnEvaluation {
  return {
    intent: 'unknown', slots: [], evidenceQuote: '',
    intentGrade: { score: 0, confidence: 0 }, clarity: 0, courtesy: 0.5,
    targetLanguageUse: 'uncertain', interaction: 'relevant',
    replyZh: CLARIFY[context.npcId],
    coach: context.mode === 'boss' ? null : {
      understood: 'I could not tell what you meant.',
      explanation: 'Try one short Mandarin sentence that says what you want.',
      improvedExample: context.npcId === 'xiaolin' ? '请给我一杯茶。' : '我要去海港。',
    },
  };
}
