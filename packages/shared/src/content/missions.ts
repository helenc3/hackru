import { MissionDefinitionSchema, type ActionTransition, type ChoiceId, type GameAction, type IntentTransition, type MissionDefinition, type MissionId, type MissionNode } from '../contracts.js';

import { authoredFacts } from './facts.js';

const action = (trigger: GameAction, nextNode: string | null, setFlags: ActionTransition['setFlags'] = {}, requiredFlags: ActionTransition['requiredFlags'] = {}, result: ActionTransition['result'] = 'none', guards: ActionTransition['guards'] = []): ActionTransition => ({ trigger, nextNode, setFlags, requiredFlags, result, guards });
const intent = (name: IntentTransition['trigger']['intent'], slots: IntentTransition['trigger']['slots'], nextNode: string, setFlags: IntentTransition['setFlags'] = {}, requiredFlags: IntentTransition['requiredFlags'] = {}): IntentTransition => ({ trigger: { intent: name, slots }, nextNode, setFlags, requiredFlags, result: 'none', guards: [] });
const choose = (choiceId: ChoiceId): GameAction => ({ type: 'choose', choiceId });
const node = (id: string, objective: string, actionTransitions: ActionTransition[], intentTransitions: IntentTransition[] = []): MissionNode => ({ id, objective, actionTransitions, intentTransitions, checkpoint: true });
const cancel = (next = 'p1.order') => intent('cancel_order', [], next, { 'p1.kiosk': true, 'p1.drink': '', 'p1.price-confirmed': false });
const drinks = (next: string) => ['tea', 'water'].map((drink) => intent('order_drink', [{ key: 'drink', value: drink as 'tea' | 'water' }], next, { 'p1.drink': drink, 'p1.price-confirmed': false }));
const confirmation = ['tea', 'water'].map((drink) => intent('confirm_drink_price', [{ key: 'drink', value: drink as 'tea' | 'water' }, { key: 'priceCny', value: drink === 'tea' ? 10 : 5 }], 'p1.receipt', { 'p1.price-confirmed': true }, { 'p1.drink': drink }));
const p1 = [
  node('p1.entrance', 'Read the entrance sign and enter from the plaza.', [
    action(choose('p1.enter-plaza-door'), 'p1.order', { 'p1.entrance': true }, {}, 'none', [{ op: 'flagEquals', flag: 'p1.sign', value: true }]),
    action(choose('p1.try-closed-door'), 'p1.entrance'),
  ]),
  node('p1.order', 'Ask Xiaolin for a drink.', [], [intent('order_drink', [{ key: 'drink', value: 'coffee' }], 'p1.substitute', { 'p1.coffee-unavailable': true }), ...drinks('p1.receipt'), cancel()]),
  node('p1.substitute', 'Choose tea or water, or cancel for the kiosk.', [], [
    ...['tea', 'water'].map((drink) => intent('accept_substitute', [{ key: 'drink', value: drink as 'tea' | 'water' }], 'p1.receipt', { 'p1.drink': drink, 'p1.price-confirmed': false })), ...drinks('p1.receipt'), cancel(),
  ]),
  node('p1.receipt', 'Confirm the drink and price, then pay.', [
    action(choose('p1.pay-cafe'), 'p1.station-arrival', { 'p1.receipt': true }, { 'p1.price-confirmed': true }, 'none', [{ op: 'flagEquals', flag: 'p1.kiosk', value: false }]),
    action(choose('p1.go-kiosk'), 'p1.receipt', {}, { 'p1.price-confirmed': true, 'p1.kiosk': true }, 'none', [{ op: 'cueDelivered', cueId: 'p1.station-directions' }]),
    action(choose('p1.pay-kiosk'), 'p1.station-arrival', { 'p1.receipt': true }, { 'p1.price-confirmed': true, 'p1.kiosk': true }, 'none', [{ op: 'cueDelivered', cueId: 'p1.station-directions' }]),
  ], [...confirmation, ...drinks('p1.receipt'), cancel()]),
  node('p1.station-arrival', 'Follow Xiaolin’s directions to the station.', [action({ type: 'moveZone', zoneId: 'concourse' }, null, {}, { 'p1.receipt': true }, 'clear', [{ op: 'cueDelivered', cueId: 'p1.station-directions' }])]),
];
const p2 = [
  node('p2.board', 'Read the Jiangbin timetable.', [action({ type: 'inspect', targetId: 'p2.timetable' }, 'p2.conversation', { 'p2.sign': true })]),
  node('p2.conversation', 'Ask Achen where the Jiangbin train leaves.', [], [intent('ask_direction', [{ key: 'destination', value: 'jiangbin' }], 'p2.pa', { 'p2.conversation': true })]),
  node('p2.pa', 'Listen to the platform-change announcement.', ['audio', 'subtitles', 'validation-text'].map((channel) => action({ type: 'playCue', cueId: 'p2.platform-change', channel: channel as 'audio' | 'subtitles' | 'validation-text' }, 'p2.route', { 'p2.pa': true }, {}, 'none', [{ op: 'cueDelivered', cueId: 'p2.platform-change' }]))),
  node('p2.route', 'Follow the updated route, or clarify with Achen.', [
    ...(['platform-1', 'platform-2', 'platform-3'] as const).map((zoneId) => action({ type: 'moveZone', zoneId }, 'p2.boarding')),
  ], [intent('confirm_platform', [{ key: 'platform', value: '3' }], 'p2.route', { 'p2.clarified': true }), intent('ask_direction', [{ key: 'destination', value: 'jiangbin' }], 'p2.route', { 'p2.clarified': true })]),
  node('p2.boarding', 'Board the Jiangbin train.', [
    action(choose('p2.board-3'), null, {}, { 'p2.sign': true, 'p2.conversation': true, 'p2.pa': true }, 'clear'),
    action(choose('p2.board-1'), 'p2.route', { 'p2.wrong-platform': true }),
    action(choose('p2.board-2'), 'p2.route', { 'p2.wrong-platform': true }),
  ]),
];
const b1 = [
  node('b1.ticket', 'Read the board and ask Lao Zhou for one Haigang ticket.', [action(choose('b1.pay-ticket'), 'b1.pa', { 'b1.ticket': true }, { 'b1.sign': true, 'b1.ticket-ready': true, 'b1.conversation': true })], [
    intent('buy_ticket', [{ key: 'destination', value: 'haigang' }], 'b1.ticket', { 'b1.ticket-requested': true }, { 'b1.sign': true }),
    intent('confirm_ticket', [{ key: 'destination', value: 'haigang' }, { key: 'quantity', value: '1' }], 'b1.ticket', { 'b1.ticket-ready': true, 'b1.conversation': true }, { 'b1.sign': true, 'b1.ticket-requested': true }),
  ]),
  node('b1.pa', 'Listen to the station announcement.', ['audio', 'subtitles', 'validation-text'].map((channel) => action({ type: 'playCue', cueId: 'b1.harbor-change', channel: channel as 'audio' | 'subtitles' | 'validation-text' }, 'b1.boarding', { 'b1.pa': true }, {}, 'none', [{ op: 'cueDelivered', cueId: 'b1.harbor-change' }]))),
  node('b1.boarding', 'Board the Haigang train before departure.', [
    action(choose('b1.board-2'), null, {}, { 'b1.sign': true, 'b1.ticket': true, 'b1.pa': true, 'b1.conversation': true }, 'clear', [{ op: 'timeRemainingAbove', remainingMs: 0 }]),
    action(choose('b1.board-1'), null, {}, {}, 'fail'), action(choose('b1.board-3'), null, {}, {}, 'fail'),
  ]),
];
const hints: Record<string, readonly [string, string, string]> = {
  'p1.entrance': ['Read the sign beside the entrance.', '广场 means plaza; 关闭 means closed.', 'Use the plaza entrance.'],
  'p1.order': ['Ask Xiaolin for a drink.', '茶 means tea; 水 means water.', '请给我一杯茶。'],
  'p1.substitute': ['Coffee is unavailable; choose a different drink.', '卖完了 means sold out.', '那就茶吧。'],
  'p1.receipt': ['Confirm the drink and its price before paying.', '茶十元 means tea costs ten yuan; 水五元 means water costs five yuan.', '茶十元。'],
  'p1.station-arrival': ['Listen to Xiaolin’s directions and leave the café.', '车站 means station; 右边 means on the right.', 'Walk to the station concourse with your receipt.'],
  'p2.board': ['Read the Jiangbin row of the timetable.', '二号站台 means platform two.', 'Ask Achen about the Jiangbin train.'],
  'p2.conversation': ['Ask Achen where your train leaves.', '在哪个站台 means at which platform.', '去江滨的车在哪个站台？'],
  'p2.pa': ['Listen for the destination and the change.', '改到 means changed to; 不是 means is not.', 'Jiangbin has moved to platform three.'],
  'p2.route': ['Compare the announcement with the original directions.', '三号站台 means platform three.', '是三号站台吗？'],
  'p2.boarding': ['Board the train for Jiangbin.', '机场 means airport; 江滨 is Jiangbin.', 'Choose the train at platform three.'],
};
const definitions = [{ id: 'P1', nodes: p1, tracks: ['reading', 'conversation', 'listening'], cues: ['p1.entrance-sign', 'p1.station-directions'], snapshots: ['p1.cafe'], choices: ['p1.enter-plaza-door', 'p1.try-closed-door', 'p1.pay-cafe', 'p1.go-kiosk', 'p1.pay-kiosk'] },
  { id: 'P2', nodes: p2, tracks: ['reading', 'listening', 'repair'], cues: ['p2.timetable', 'p2.platform-change'], snapshots: ['p2.original', 'p2.updated'], choices: ['p2.board-1', 'p2.board-2', 'p2.board-3'] },
  { id: 'B1', nodes: b1, tracks: ['reading', 'listening', 'conversation'], cues: ['b1.destination-board', 'b1.harbor-change'], snapshots: ['b1.original', 'b1.updated'], choices: ['b1.pay-ticket', 'b1.board-1', 'b1.board-2', 'b1.board-3'] }] as const;

export const missions: readonly MissionDefinition[] = definitions.map((definition) => MissionDefinitionSchema.parse({
  id: definition.id, mode: definition.id === 'B1' ? 'boss' : 'practice', startNode: definition.nodes[0]?.id, nodes: definition.nodes,
  reward: { id: `${definition.id.toLowerCase()}.clear`, xp: definition.id === 'B1' ? 150 : 100, items: { hint: definition.id === 'P1' ? 1 : 0, freeze: definition.id === 'P2' ? 1 : 0 }, independentRepairXp: definition.id === 'P2' ? 20 : 0, ...(definition.id === 'B1' ? { badge: 'station-navigator' } : {}) },
  prerequisiteMissionIds: definition.id === 'P1' ? [] : [definition.id === 'P2' ? 'P1' : 'P2'], allowedActionIds: definition.choices,
  variants: (definition.id === 'B1' ? [1] : [0, 1, 2]).map((tier) => ({ tier, factSnapshots: definition.snapshots.map((id) => ({ id, facts: authoredFacts[id] })), targetTracks: definition.tracks, cueIds: definition.cues })),
  hints: definition.id === 'B1' ? [] : definition.nodes.flatMap((entry) => [1, 2, 3].map((level) => ({ id: `${entry.id}.hint-${level}`, nodeId: entry.id, level, text: hints[entry.id]![level - 1] }))),
  activeTimerMs: definition.id === 'P1' ? null : definition.id === 'P2' ? 120_000 : 180_000,
}));

export function missionFor(id: MissionId): MissionDefinition {
  const mission = missions.find((entry) => entry.id === id);
  if (!mission) throw new Error(`Unknown mission ${id}`);
  return mission;
}
