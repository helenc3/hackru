import type { Directions, GameLanguage, NpcId } from './contracts.js';
import * as zh from './content/facts.js';
import { TEXT_CATALOG } from './city/text-catalog.js';

/** Authored English for testing: facts, prices and quest gates stay identical. */
const groundedReplies: Record<keyof typeof zh.groundedReplies, string> = {
  vendorOpener: 'Hello! What would you like to drink?',
  coffeeUnavailable: 'Coffee is sold out. We have tea and water.',
  teaPrice: 'Tea is 10 yuan. The buns are still steaming, 3 yuan each. Want one later?',
  waterPrice: 'Water is 5 yuan. Sweet potatoes are nearly ready, 5 yuan each. Want to wait?',
  missingDrinkPrice: 'Tea is 10 yuan and water is 5 yuan. Which would you like?',
  priceConfirmed: 'All right.', cancelOrder: 'No problem. Would you like anything else?',
  guideOpener: 'Hi! Can I help?', noRoute: 'Sorry, I am not sure how to get there.',
  unknownPlace: 'Sorry, I do not know that place.', passerbyOpener: 'Hi! Did you need something?',
  photoAccepted: 'Sure! Stand over there with the river behind you. Are you visiting?',
  photoNoRiver: 'You cannot see the river here. Try down by the riverside.',
  photoPending: 'Ready? I will count to three.', clarification: 'Sorry, could you repeat that?',
  farewell: 'Goodbye!', farewellPaid: 'Take care! Come again!',
};
const pacingReplies: Record<NpcId, readonly string[]> = {
  vendor: ['Yes, we have that. You are not from Shanghai, are you? Where are you from?', 'Just a moment! I also have sweet potatoes for 5 yuan. Want to try one?', 'We have tea and water. Where have you been today?', 'One moment, let me check the buns.'],
  guide: ['The Shanghai Grand Hotel? Yes, I know it. Is this your first visit?', 'It is not far. Are you here for work or a holiday?', 'Let me think of the nearest way. Have you visited the Bund?', 'Yes, I know it. Are you travelling alone?'],
  passerby: ['A photo? It is a lovely view. Where are you from?', 'Sure, one moment. Look at those beautiful boats!', 'The light is lovely now. Those buildings look even better at night.', 'Of course. Do you like Shanghai?'],
};
const impatienceReplies: Record<NpcId, { first: string; last: string; leave: string }> = {
  vendor: { first: ' I do have a stall to run.', last: ' Other customers are waiting. Please hurry.', leave: 'Sorry, I am busy now. Please come back another time.' },
  guide: { first: ' I have somewhere to be.', last: ' Sorry, I really must go soon.', leave: 'Sorry, I have to go now. Goodbye!' },
  passerby: { first: ' I need to leave soon.', last: ' It is getting dark. I must go.', leave: 'Sorry, I must go now. Goodbye!' },
};
const smallTalkReplies: Record<NpcId, readonly string[]> = {
  vendor: ['Welcome! It is busy and hot today.', 'Then you should try our buns sometime.'],
  guide: ['Visit the Bund tonight. It is beautiful.', 'You should try the soup dumplings.'],
  passerby: ['Look at those boats. Their lights come on at night.', 'Welcome to Shanghai! Do you like it here?'],
};
const clarifyReplies: Record<string, string> = {
  'q1.buy': 'Would you like tea or water?', 'q2.ask': 'Where would you like to go?',
  'q3.photo': 'Sorry, what did you say?', default: 'Sorry, could you repeat that?',
};
const english = {
  groundedReplies, pacingReplies, impatienceReplies, smallTalkReplies, clarifyReplies,
  speakMandarinReplies: clarifyReplies,
  npcOpeners: { vendor: groundedReplies.vendorOpener, guide: groundedReplies.guideOpener, passerby: groundedReplies.passerbyOpener },
};
export function conversationContent(language: GameLanguage = 'zh') { return language === 'en' ? english : zh; }
export function languageName(language: GameLanguage = 'zh') { return language === 'en' ? 'English' : 'Mandarin'; }
export function languageTag(language: GameLanguage = 'zh') { return language === 'en' ? 'en' : 'zh-Hans'; }
/** All steps come from the server-verified route; never truncate or invent a turn. */
export function directionsText(route: Directions, language: GameLanguage = 'zh'): string {
  return language === 'en' ? route.steps.map((step) => step.english).join('. ') + '.' : route.textZh;
}
const translations = Object.values(TEXT_CATALOG).flatMap((catalog) => Object.values(catalog).map((row) => [row.zh, row.english] as const))
  .concat([
    ['付款', 'Pay'], ['拍照点', 'Photo spot'], ['地标', 'Landmark'],
    ['茶 means tea; 水 means water. Coffee (咖啡) is sold out.', 'Tea and water are available. Coffee is sold out.'],
    ['怎么走 means how do I get there.', 'Ask how to get to the Shanghai Grand Hotel.'],
    ['拍张照 means take a photo.', 'Ask someone to take your photo.'],
    ['我要水。', 'I would like water.'], ['请问，去上海大酒店怎么走？', 'How do I get to the Shanghai Grand Hotel?'],
    ['可以帮我在这里拍张照吗？', 'Could you take my photo here?'],
  ]).sort((a, b) => b[0].length - a[0].length);
/** Display-only catalog translations. Stable IDs, manifests and collision geometry never change. */
export function worldText(value: string, language: GameLanguage = 'zh'): string {
  if (language !== 'en') return value;
  return translations.reduce((out, [chinese, english]) => out.split(chinese).join(english), value);
}
export function conversationFacts(facts: Record<string, string>, language: GameLanguage): Record<string, string> {
  if (language !== 'en') return facts;
  return Object.fromEntries(Object.entries(facts).map(([key, value]) => [key,
    key === 'opener' ? groundedReplies.vendorOpener : key === 'coffee' ? 'Sold out'
      : key === 'otherWares' ? 'Buns cost 3 yuan each and are still steaming for ten minutes; sweet potatoes cost 5 yuan and are still roasting; tea eggs cost 2 yuan and are sold out. Only tea and water can be sold now.'
        : worldText(value, language),
  ]));
}
