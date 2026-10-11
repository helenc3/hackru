export const authoredFacts = {
  'p1.cafe': { coffee: '卖完了', teaPriceCny: '10', waterPriceCny: '5', stationDirections: '从广场走到车站。进去后，售票处在右边。' },
  'p2.original': { jiangbinPlatform: '2', departureTime: '14:30' },
  'p2.updated': { jiangbinPlatform: '3', airportPlatform: '2' },
  'b1.original': { haigangPlatform: '1', airportPlatform: '2', jiangbinPlatform: '3', ticketPriceCny: '15', ticketQuantity: '1' },
  'b1.updated': { haigangPlatform: '2', platform1Status: '不再发车', airportStatus: '取消', jiangbinPlatform: '3', ticketPriceCny: '15', ticketQuantity: '1' },
} as const;

export const groundedReplies = {
  coffeeUnavailable: '咖啡卖完了。我们有茶和水。',
  teaPrice: '一杯茶十元。请确认：茶十元，对吗？',
  waterPrice: '一杯水五元。请确认：水五元，对吗？',
  missingDrinkPrice: '请确认饮料和价格。您可以说：茶十元，或者水五元。',
  ticketDetails: '去海港，要几张票？',
  ticketPrice: '一张去海港的票，十五元。',
  jiangbinOriginal: '去江滨的车在二号站台。',
  jiangbinUpdated: '去江滨的车改到三号站台。',
  haigangUpdated: '去海港的车改到二号站台。',
  wrongPracticePlatform: '这趟车去机场。',
  clarification: '请再说一遍。',
  farewell: '再见。',
  farewellCafe: '好的，再见！',
  farewellPaid: '谢谢，慢走！',
} as const;

/** Practice-only: non-Mandarin or unclear input gets the target phrase for the current node instead of a reaction. */
export const speakMandarinReplies: Record<string, string> = {
  'p1.order': '请说中文。您可以说：我要一杯茶。',
  'p1.substitute': '请用中文说：那就茶吧。',
  'p1.receipt.tea': '请用中文确认：茶十元。',
  'p1.receipt.water': '请用中文确认：水五元。',
  'p1.receipt': '请用中文确认：茶十元，或者水五元。',
  'p2.conversation': '请说中文。您可以说：去江滨的车在哪个站台？',
  'p2.route': '请说中文。您可以说：是三号站台吗？',
  default: '请用中文再说一遍。',
};

/** Practice-only: an unclear but Mandarin turn gets a clarifying question that carries the node's key words. */
export const clarifyReplies: Record<string, string> = {
  'p1.order': '我没听懂。您要茶还是水？',
  'p1.substitute': '我没听懂。您要茶还是水？',
  'p1.receipt.tea': '我没听懂。茶十元，对吗？',
  'p1.receipt.water': '我没听懂。水五元，对吗？',
  'p1.receipt': '我没听懂。茶十元，水五元。您要哪个？',
  'p2.conversation': '我没听懂。您要去江滨吗？',
  'p2.route': '我没听懂。您问几号站台？',
  default: '我没听懂。请再说一遍。',
};
