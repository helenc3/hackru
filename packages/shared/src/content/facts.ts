export const authoredFacts = {
  'p1.cafe': { coffee: '卖完了', teaPriceCny: '10', waterPriceCny: '5', stationDirections: '从广场走到车站。进去后，售票处在右边。' },
  'p2.original': { jiangbinPlatform: '2', departureTime: '14:30' },
  'p2.updated': { jiangbinPlatform: '3', airportPlatform: '2' },
  'b1.original': { haigangPlatform: '1', airportPlatform: '2', jiangbinPlatform: '3', ticketPriceCny: '15', ticketQuantity: '1' },
  'b1.updated': { haigangPlatform: '2', platform1Status: '不再发车', airportStatus: '取消', jiangbinPlatform: '3', ticketPriceCny: '15', ticketQuantity: '1' },
} as const;

export const groundedReplies = {
  coffeeUnavailable: '咖啡卖完了。我们有茶和水。',
  teaPrice: '一杯茶十元。请确认饮料和价格。',
  waterPrice: '一杯水五元。请确认饮料和价格。',
  missingDrinkPrice: '请确认饮料和价格。茶十元，水五元。',
  ticketDetails: '去海港，要几张票？',
  ticketPrice: '一张去海港的票，十五元。',
  jiangbinOriginal: '去江滨的车在二号站台。',
  jiangbinUpdated: '去江滨的车改到三号站台。',
  haigangUpdated: '去海港的车改到二号站台。',
  wrongPracticePlatform: '这趟车去机场。',
  clarification: '请再说一遍。',
} as const;
