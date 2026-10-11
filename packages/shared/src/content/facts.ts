export const DRINK_PRICES = { tea: 10, water: 5 } as const;
export const STARTING_CNY = 20;

export const authoredFacts = {
  'q1.drinks': { opener: '你想喝什么？', coffee: '卖完了', teaPriceCny: '10', waterPriceCny: '5',
    otherWares: '包子三块一个（还在蒸，要再等十来分钟）；烤红薯五块一个（还在烤）；茶叶蛋两块一个（今天卖完了）。Only tea and water can be sold right now; mention these in passing, never sell them.',
    smallTalk: 'You like chatting with customers: where they are from, whether it is their first time in Shanghai, the weather, how busy the street is.' },
  'q2.hotel': { destination: '上海大酒店', routeSource: 'Only a hotelRoute fact, when present, describes the way. Never describe roads or turns yourself.',
    smallTalk: 'You like asking visitors where they are from and what they have seen; you might recommend 外滩 at night or 小笼包. You never describe a route except the hotelRoute fact.' },
  'q3.photo': { river: '黄浦江', setting: 'You are walking along the river; people sometimes ask strangers to take a photo of them here.',
    smallTalk: 'You enjoy the view: the boats on the river, the skyline across the water, the evening lights. You ask visitors where they are from and if they like Shanghai.' },
} as const;

// In-world speech only: these people do not know they are in a game and never coach.
// Language help lives in the separate coach/hint channel.
export const groundedReplies = {
  vendorOpener: '你好！你想喝什么？',
  coffeeUnavailable: '咖啡卖完了。我们有茶和水。', // verbatim from docs/NEW_QUESTS.md
  teaPrice: '好嘞，茶十块。包子还在蒸，三块一个，等会儿要不要来一个？',
  waterPrice: '好嘞，水五块。烤红薯马上就好，五块一个，要不要等等？',
  missingDrinkPrice: '茶十块，水五块，要哪个？',
  priceConfirmed: '好嘞。',
  cancelOrder: '没事儿。还要点别的吗？',
  guideOpener: '嗯？怎么了？',
  noRoute: '这个……我还真不太清楚怎么走。',
  unknownPlace: '那个地方我不太熟，不好意思。',
  passerbyOpener: '嗯？有事吗？',
  photoAccepted: '行啊！你站那边，把江拍进去。你是来旅游的吗？',
  photoNoRiver: '这儿看不到江啊，去江边拍吧。',
  photoPending: '站好了吗？我数三下。',
  clarification: '啊？再说一遍？',
  farewell: '再见！',
  farewellPaid: '慢走啊！',
} as const;

/**
 * Warm-up deferrals: a goal request before the NPC is ready (engine GOAL_WARMUP_EXCHANGES) gets one of
 * these in-character lines in turn; the request is remembered and delivered once the warm-up is over.
 */
export const pacingReplies = {
  vendor: ['有有有。听口音你不是上海人吧？哪儿来的？', '马上马上。我这儿还有烤红薯，五块一个，要不要尝尝？', '别急别急，茶和水都有。你今天去哪儿玩了？', '好好好，你等一下啊，我先看一眼包子。'],
  guide: ['上海大酒店啊？知道知道。你第一次来上海吧？', '不远不远。你来上海是玩儿还是工作？', '你等一下，我想想怎么走最近……你去过外滩了吗？', '嗯，我知道。你一个人来的？'],
  passerby: ['拍照啊？这儿风景是不错。你从哪儿来的呀？', '好啊，等一下，你先看那边的船，多漂亮。', '现在光线正好。你看对岸那些楼，晚上更好看。', '行啊。你喜欢上海吗？'],
} as const;
/** Impatience near the patience limit (appended to the reply), then the line the NPC leaves on. Authored, in character. */
export const impatienceReplies = {
  vendor: { first: '……哎，我这儿还要做生意呢。', last: '后面还有人排队呢，快点儿吧。', leave: '算了算了，我忙着呢，你下次再来吧。' },
  guide: { first: '……我还有点事儿。', last: '不好意思，我真得走了。', leave: '我真来不及了，先走了啊。' },
  passerby: { first: '……我一会儿还得走呢。', last: '天快黑了，我得走了。', leave: '不好意思，我得走了，拜拜。' },
} as const;
/** Small talk in fixture sessions (the live model writes its own, bounded by the smallTalk facts). */
export const smallTalkReplies = {
  vendor: ['哦，欢迎欢迎！今天人多，热死了。', '是吗？那你可得尝尝我们这儿的包子。'],
  guide: ['不错啊！晚上去外滩看看，很漂亮。', '那你一定要吃小笼包。'],
  passerby: ['你看那边的船，晚上灯都亮了。', '欢迎来上海！喜欢这儿吗？'],
} as const;

/** Opening line per role, spoken when a conversation starts. */
export const npcOpeners = { vendor: groundedReplies.vendorOpener, guide: groundedReplies.guideOpener, passerby: groundedReplies.passerbyOpener } as const;

/** English or off-target input: natural confusion, with only the cue a real person would give. */
export const speakMandarinReplies: Record<string, string> = {
  'q1.buy': '啊？听不懂……要喝点什么？有茶和水。',
  'q2.ask': '不好意思，听不懂。你要去哪儿？',
  'q3.photo': '嗯？听不太懂……要帮忙吗？',
  default: '啊？听不懂。',
};

/** Unclear Mandarin: an in-character clarification. */
export const clarifyReplies: Record<string, string> = {
  'q1.buy': '啊？你要茶还是水？',
  'q2.ask': '什么？你要去哪儿？',
  'q3.photo': '嗯？你说什么？',
  default: '啊？什么？',
};

/** Phrases that coach the player; they belong in the coach channel, never in an NPC's mouth. */
export const COACHING_PHRASES = ['您可以说', '你可以说', '请说中文', '请用中文', 'you can say'] as const;
