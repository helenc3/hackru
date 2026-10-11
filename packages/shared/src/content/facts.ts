export const DRINK_PRICES = { tea: 10, water: 5 } as const;
export const STARTING_CNY = 20;

export const authoredFacts = {
  'q1.drinks': { opener: '你想喝什么？', coffee: '卖完了', teaPriceCny: '10', waterPriceCny: '5' },
  'q2.hotel': { destination: '上海大酒店', routeSource: 'The server supplies the verified route. Never describe roads or turns yourself.' },
  'q3.photo': { river: '黄浦江', request: 'The player may ask you to take their photo by the river.' },
} as const;

export const groundedReplies = {
  vendorOpener: '你好！你想喝什么？',
  coffeeUnavailable: '咖啡卖完了。我们有茶和水。',
  teaPrice: '好的，一杯茶，十元。',
  waterPrice: '好的，一杯水，五元。',
  missingDrinkPrice: '您想喝茶还是水？茶十元，水五元。',
  priceConfirmed: '好的，请付款。',
  cancelOrder: '好的。您想喝茶还是水？',
  guideOpener: '你好！需要帮忙吗？',
  noRoute: '不好意思，我不太清楚怎么走。',
  unknownPlace: '不好意思，这个地方我不知道。我只知道去上海大酒店的路。',
  passerbyOpener: '你好！有什么事吗？',
  photoAccepted: '好啊！请站到那边，江在你后面。',
  photoNoRiver: '这里看不到黄浦江。我们去江边拍吧。',
  photoPending: '请站到拍照点，我数到三。',
  clarification: '请再说一遍。',
  farewell: '再见。',
  farewellPaid: '谢谢，慢走！',
} as const;

/** Opening line per role, spoken when a conversation starts. */
export const npcOpeners = { vendor: groundedReplies.vendorOpener, guide: groundedReplies.guideOpener, passerby: groundedReplies.passerbyOpener } as const;

/** Non-Mandarin or off-target input gets the quest's target phrase instead of a reaction. */
export const speakMandarinReplies: Record<string, string> = {
  'q1.buy': '请说中文。您可以说：我要一杯水。',
  'q2.ask': '请说中文。您可以说：请问，去上海大酒店怎么走？',
  'q3.photo': '请说中文。您可以说：可以帮我在这里拍张照吗？',
  default: '请用中文再说一遍。',
};

/** An unclear but Mandarin turn gets a clarifying question that carries the quest's key words. */
export const clarifyReplies: Record<string, string> = {
  'q1.buy': '我没听懂。您要茶还是水？',
  'q2.ask': '我没听懂。您要去哪儿？',
  'q3.photo': '我没听懂。您需要我帮什么忙？',
  default: '我没听懂。请再说一遍。',
};
