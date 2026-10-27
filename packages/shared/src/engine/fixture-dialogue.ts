import { TurnEvaluationSchema, type DialogueProvider, type Intent, type Slot } from '../contracts.js';
import { conversationContent } from '../language.js';
import { smallTalkReplies } from '../content/facts.js';

/** Only documented fixture utterances; never a general language interpreter. */
const examples: Record<string, { intent: Intent; slots: Slot[] }> = {
  '你好': { intent: 'greeting', slots: [] },
  '我是美国人': { intent: 'small_talk', slots: [] },
  '我从美国来': { intent: 'small_talk', slots: [] },
  '我第一次来上海': { intent: 'small_talk', slots: [] },
  '是的第一次来': { intent: 'small_talk', slots: [] },
  '今天天气很好': { intent: 'small_talk', slots: [] },
  '上海很漂亮': { intent: 'small_talk', slots: [] },
  '再见': { intent: 'farewell', slots: [] },
  '拜拜': { intent: 'farewell', slots: [] },
  '谢谢再见': { intent: 'farewell', slots: [] },
  '谢谢': { intent: 'farewell', slots: [] },
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
  '请再说一遍': { intent: 'request_repeat', slots: [] },
  '请问去上海大酒店怎么走': { intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] },
  '去上海大酒店怎么走': { intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] },
  '上海大酒店在哪儿': { intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] },
  '上海大酒店在哪里': { intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] },
  '请问上海大酒店在哪儿': { intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] },
  '去火车站怎么走': { intent: 'ask_directions', slots: [{ key: 'destination', value: 'other' }] },
  '可以帮我在这里拍张照吗': { intent: 'request_photo', slots: [] },
  '可以帮我拍张照吗': { intent: 'request_photo', slots: [] },
  '请帮我拍张照': { intent: 'request_photo', slots: [] },
  '能帮我拍一张照片吗': { intent: 'request_photo', slots: [] },
  'canyoutakemyphoto': { intent: 'request_photo', slots: [] },
};
/** Fixed English examples for offline testing, not a live language model. */
const englishExamples: Record<string, { intent: Intent; slots: Slot[] }> = {
  hello: { intent: 'greeting', slots: [] }, hi: { intent: 'greeting', slots: [] },
  iamfromamerica: { intent: 'small_talk', slots: [] }, thisismyfirstvisit: { intent: 'small_talk', slots: [] },
  shanghaiisbeautiful: { intent: 'small_talk', slots: [] }, theweatherisnice: { intent: 'small_talk', slots: [] },
  goodbye: { intent: 'farewell', slots: [] }, bye: { intent: 'farewell', slots: [] },
  iwantcoffee: { intent: 'order_drink', slots: [{ key: 'drink', value: 'coffee' }] },
  iwanttea: { intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }] },
  pleasegivemeacupoftea: { intent: 'order_drink', slots: [{ key: 'drink', value: 'tea' }] },
  iwantwater: { intent: 'order_drink', slots: [{ key: 'drink', value: 'water' }] },
  pleasegivemeacupofwater: { intent: 'order_drink', slots: [{ key: 'drink', value: 'water' }] },
  illhaveteainstead: { intent: 'accept_substitute', slots: [{ key: 'drink', value: 'tea' }] },
  yes: { intent: 'confirm_drink_price', slots: [] }, okay: { intent: 'confirm_drink_price', slots: [] },
  cancelmyorder: { intent: 'cancel_order', slots: [] },
  pleasesaythatagain: { intent: 'request_repeat', slots: [] },
  howdoigettotheshanghaigrandhotel: { intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] },
  whereistheshanghaigrandhotel: { intent: 'ask_directions', slots: [{ key: 'destination', value: 'grand-hotel' }] },
  howdoigettothetrainstation: { intent: 'ask_directions', slots: [{ key: 'destination', value: 'other' }] },
  canyoutakemyphoto: { intent: 'request_photo', slots: [] },
  pleasetakemyphoto: { intent: 'request_photo', slots: [] },
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
    const english = context.language === 'en';
    const englishText = playerText.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
    const text = playerText.normalize('NFKC').replace(/[。，？！,.?!\s]/g, '');
    let matched = english ? englishExamples[englishText] : examples[text] ?? examples[playerText];
    const priceMatch = /^(茶|水)([0-9零一二两三四五六七八九十百千壹贰叁]+)元$/.exec(text);
    if (priceMatch && !english) {
      const price = parseFixturePrice(priceMatch[2]!);
      matched = { intent: 'confirm_drink_price', slots: [{ key: 'drink', value: priceMatch[1] === '茶' ? 'tea' : 'water' }, ...(price === undefined ? [] : [{ key: 'priceCny' as const, value: price }])] };
    }
    const englishPrice = /^(tea|water)([0-9]+)(?:yuan|cny)?$/.exec(englishText);
    if (english && englishPrice) matched = { intent: 'confirm_drink_price', slots: [{ key: 'drink', value: englishPrice[1] as 'tea' | 'water' }, { key: 'priceCny', value: Number(englishPrice[2]) }] };
    const allowed = matched && context.allowedIntents.includes(matched.intent);
    const insult = text === '你真笨' || (english && englishText === 'youarestupid');
    const languageUse = english ? /[A-Za-z]/.test(playerText) ? 'yes' : 'no' : /^[A-Za-z\s]+$/.test(text) ? 'no' : allowed ? 'yes' : 'uncertain';
    const content = conversationContent(context.language);
    return TurnEvaluationSchema.parse({ intent: allowed ? matched.intent : 'unknown', slots: allowed ? matched.slots : [], evidenceQuote: allowed ? playerText : '', intentGrade: { score: allowed ? 0.95 : 0, confidence: allowed ? 0.95 : 0.5 }, clarity: allowed ? 0.9 : 0.3, courtesy: insult ? 0 : 0.8, targetLanguageUse: languageUse, interaction: insult ? 'insult' : allowed ? matched.intent === 'request_repeat' ? 'repeat' : 'relevant' : 'irrelevant', replyZh: allowed && matched.intent === 'small_talk' ? (english ? content.smallTalkReplies : smallTalkReplies)[context.npcId][Math.floor(context.history.length / 2) % 2]! : content.groundedReplies.clarification, coach: { understood: allowed ? 'Recognized a documented fixture request.' : 'This fixture phrase is not recognized.', explanation: 'Fixture mode recognizes a fixed set of example phrases.', improvedExample: english ? 'Please say that again.' : '请再说一遍。' } });
  } };
}
