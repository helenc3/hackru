// Simplified Chinese world text. Generated content never supplies free text: catalog params of
// type 'text' select a key here. review: 'pending' until a Mandarin reader approves the row.
export type TextRow = { zh: string; english: string; review: 'pending' | 'reviewed' };
type Catalog = Record<string, TextRow>;
const rows = (entries: Record<string, [string, string]>): Catalog =>
  Object.fromEntries(Object.entries(entries).map(([key, [zh, english]]) => [key, { zh, english, review: 'pending' }]));

export const TEXT_CATALOG = {
  'shop-name': rows({
    cafe: ['咖啡馆', 'Café'], tea: ['茶馆', 'Teahouse'], noodles: ['面馆', 'Noodle shop'], dumplings: ['小笼包', 'Soup dumplings'],
    bakery: ['面包店', 'Bakery'], convenience: ['便利店', 'Convenience store'], fruit: ['水果店', 'Fruit shop'], books: ['书店', 'Bookshop'],
    flowers: ['花店', 'Florist'], pharmacy: ['药店', 'Pharmacy'], clothes: ['服装店', 'Clothing shop'], market: ['菜市场', 'Wet market'],
    drinks: ['饮料', 'Drinks'], snacks: ['小吃', 'Snacks'], restaurant: ['饭店', 'Restaurant'], bank: ['银行', 'Bank'],
  }),
  'road-name': rows({
    nanjing: ['南京路', 'Nanjing Road'], huaihai: ['淮海路', 'Huaihai Road'], fuzhou: ['福州路', 'Fuzhou Road'], jiujiang: ['九江路', 'Jiujiang Road'],
    hankou: ['汉口路', 'Hankou Road'], yanan: ['延安路', "Yan'an Road"], sichuan: ['四川路', 'Sichuan Road'], henan: ['河南路', 'Henan Road'],
    shanxi: ['山西路', 'Shanxi Road'], zhejiang: ['浙江路', 'Zhejiang Road'], xizang: ['西藏路', 'Xizang Road'], yunnan: ['云南路', 'Yunnan Road'],
    zhongshan: ['中山路', 'Zhongshan Road'], binjiang: ['滨江大道', 'Binjiang Avenue'], suzhou: ['苏州路', 'Suzhou Road'], wuding: ['武定路', 'Wuding Road'],
  }),
  menu: rows({
    drinks: ['茶 十元\n水 五元\n咖啡 卖完了', 'Tea ¥10 · Water ¥5 · Coffee sold out'],
    noodles: ['牛肉面 二十元', 'Beef noodles ¥20'], dumplings: ['小笼包 十五元', 'Soup dumplings ¥15'],
  }),
  landmark: rows({
    'grand-hotel': ['上海大酒店', 'Shanghai Grand Hotel'], huangpu: ['黄浦江', 'Huangpu River'], 'suzhou-creek': ['苏州河', 'Suzhou Creek'],
    metro: ['地铁站', 'Metro station'], park: ['公园', 'Park'], bridge: ['桥', 'Bridge'], viewpoint: ['观景台', 'Viewing deck'],
    'people-square': ['人民广场', "People's Square"], 'lane-gate': ['弄堂', 'Lane'],
  }),
  'npc-name': rows({
    xiaolin: ['小林', 'Xiaolin'], laowang: ['老王', 'Lao Wang'], xiaomei: ['小美', 'Xiaomei'], achen: ['阿陈', 'A-Chen'],
    laozhou: ['老周', 'Lao Zhou'], ayi: ['王阿姨', 'Auntie Wang'], xiaoli: ['小李', 'Xiaoli'], dazhang: ['大张', 'Da Zhang'],
  }),
  notice: rows({
    open: ['营业中', 'Open'], welcome: ['欢迎光临', 'Welcome'], exit: ['出口', 'Exit'], entrance: ['入口', 'Entrance'],
    'no-swimming': ['禁止游泳', 'No swimming'], 'photo-spot': ['拍照点', 'Photo spot'], toilet: ['洗手间', 'Restroom'],
  }),
} as const satisfies Record<string, Catalog>;
export type TextCatalogName = keyof typeof TEXT_CATALOG;

export function text(catalog: TextCatalogName, key: string): TextRow | undefined {
  return (TEXT_CATALOG[catalog] as Catalog)[key];
}
