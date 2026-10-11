import { TurnEvaluationSchema, type DialogueProvider, type Intent, type Slot } from '../contracts.js';

/** Only documented fixture utterances; never a general language interpreter. */
const examples: Record<string, { intent: Intent; slots: Slot[] }> = {
  '你好': { intent: 'greeting', slots: [] },
  '我要咖啡': { intent: 'order_drink', slots: [{ key: 'drink', value: 'coffee' }] },
  '请给我一杯咖啡': { intent: 'order_drink', slots: [{ key: 'drink', value: 'coffee' }] },
  '我要茶': { intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }] },
  '请给我一杯茶': { intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }] },
  '有茶吗': { intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }] },
  '我要水': { intent: 'order_drink', slots: [{ key: 'drink', value: 'water' }] },
  '我要一杯水': { intent: 'order_drink', slots: [{ key: 'drink', value: 'water' }] },
  '那就茶吧': { intent: 'accept_substitute', slots: [{ key: 'drink', value: 'tea' }] },
  '好的': { intent: 'confirm_drink_price', slots: [] },
  '对': { intent: 'confirm_drink_price', slots: [] },
  '可以': { intent: 'confirm_drink_price', slots: [] },
  '取消订单': { intent: 'cancel_order', slots: [] },
  '我不要了': { intent: 'cancel_order', slots: [] },
  '去江滨的车在哪个站台': { intent: 'ask_direction', slots: [{ key: 'destination', value: 'jiangbin' }] },
  '去江濱的车在哪个站台': { intent: 'ask_direction', slots: [{ key: 'destination', value: 'jiangbin' }] },
  '去海港的车在哪个站台': { intent: 'ask_direction', slots: [{ key: 'destination', value: 'haigang' }] },
  '是三号站台吗': { intent: 'confirm_platform', slots: [{ key: 'platform', value: '3' }] },
  '是3号站台吗': { intent: 'confirm_platform', slots: [{ key: 'platform', value: '3' }] },
  '是叁号站台吗': { intent: 'confirm_platform', slots: [{ key: 'platform', value: '3' }] },
  '是二号站台吗': { intent: 'confirm_platform', slots: [{ key: 'platform', value: '2' }] },
  '请再说一遍': { intent: 'request_repeat', slots: [] },
  '我要一张去海港的票': { intent: 'buy_ticket', slots: [{ key: 'destination', value: 'haigang' }, { key: 'quantity', value: '1' }] },
  '请给我一张海港的车票': { intent: 'buy_ticket', slots: [{ key: 'destination', value: 'haigang' }, { key: 'quantity', value: '1' }] },
  '海港一张': { intent: 'confirm_ticket', slots: [{ key: 'destination', value: 'haigang' }, { key: 'quantity', value: '1' }] },
  '一张去海港的票': { intent: 'confirm_ticket', slots: [{ key: 'destination', value: 'haigang' }, { key: 'quantity', value: '1' }] },
  'one ticket to Harbor': { intent: 'buy_ticket', slots: [{ key: 'destination', value: 'haigang' }, { key: 'quantity', value: '1' }] },
};
// Decimal digits and Mandarin digit/unit forms are normalized without guessing.
export function parseFixturePrice(text: string): number | undefined {
  const normalized = text.normalize('NFKC');
  if (/^\d+$/.test(normalized)) { const price = Number(normalized); return price <= 1000 ? price : undefined; }
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 壹: 1, 贰: 2, 叁: 3 };
  if (!/^[零一二两三四五六七八九十百千壹贰叁]+$/.test(normalized)) return undefined;
  let total = 0; let digit = 0; let previousUnit = Infinity;
  for (const character of normalized) {
    if (character in digits) { digit = digit * 10 + digits[character]!; continue; }
    const unit = character === '十' ? 10 : character === '百' ? 100 : 1000;
    if (unit >= previousUnit || digit > 9) return undefined;
    total += (digit || 1) * unit; digit = 0; previousUnit = unit;
  }
  const result = total + digit;
  return result <= 1000 ? result : undefined;
}
export function createFixtureDialogueProvider(): DialogueProvider {
  return { evaluate: async (context, playerText) => {
    const text = playerText.normalize('NFKC').replace(/[。，？！,.?!\s]/g, '');
    let matched = examples[text] ?? examples[playerText];
    const priceMatch = /^(茶|水)([0-9零一二两三四五六七八九十百千壹贰叁]+)元$/.exec(text);
    if (priceMatch) {
      const price = parseFixturePrice(priceMatch[2]!);
      matched = { intent: 'confirm_drink_price', slots: [{ key: 'drink', value: priceMatch[1] === '茶' ? 'tea' : 'water' }, ...(price === undefined ? [] : [{ key: 'priceCny' as const, value: price }])] };
    }
    const allowed = matched && context.allowedIntents.includes(matched.intent);
    const insult = text === '你真笨';
    return TurnEvaluationSchema.parse({ intent: allowed ? matched.intent : 'unknown', slots: allowed ? matched.slots : [], evidenceQuote: allowed ? playerText : '', intentGrade: { score: allowed ? 0.95 : 0, confidence: allowed ? 0.95 : 0.5 }, clarity: allowed ? 0.9 : 0.3, courtesy: insult ? 0 : 0.8, targetLanguageUse: playerText === 'one ticket to Harbor' ? 'no' : allowed ? 'yes' : 'uncertain', interaction: insult ? 'insult' : allowed ? matched.intent === 'request_repeat' ? 'repeat' : 'relevant' : 'irrelevant', replyZh: '请再说一遍。', coach: context.mode === 'boss' ? null : { understood: allowed ? 'Recognized a documented fixture request.' : 'This fixture phrase is not recognized.', explanation: 'Fixture mode recognizes a fixed set of example phrases.', improvedExample: '请再说一遍。' } });
  } };
}
