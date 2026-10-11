import { MissionDefinitionSchema, type ActionTransition, type IntentTransition, type MissionDefinition, type MissionId, type MissionNode } from '../contracts.js';
import { authoredFacts } from './facts.js';

const action = (trigger: ActionTransition['trigger'], nextNode: string | null, setFlags: ActionTransition['setFlags'] = {}, requiredFlags: ActionTransition['requiredFlags'] = {}, result: ActionTransition['result'] = 'none'): ActionTransition => ({ trigger, nextNode, setFlags, requiredFlags, result, guards: [] });
const intent = (name: IntentTransition['trigger']['intent'], slots: IntentTransition['trigger']['slots'], nextNode: string | null, setFlags: IntentTransition['setFlags'] = {}, requiredFlags: IntentTransition['requiredFlags'] = {}, result: IntentTransition['result'] = 'none'): IntentTransition => ({ trigger: { intent: name, slots }, nextNode, setFlags, requiredFlags, result, guards: [] });
const node = (id: string, objective: string, actionTransitions: ActionTransition[], intentTransitions: IntentTransition[] = []): MissionNode => ({ id, objective, actionTransitions, intentTransitions, checkpoint: true });

// Q1 mirrors the original café flow: order → (coffee sold out → substitute) → confirm price → explicit pay.
const cancel = () => intent('cancel_order', [], 'q1.order', { 'q1.drink': '', 'q1.price-confirmed': false });
const drinks = (next: string) => (['tea', 'water'] as const).map((drink) => intent('order_drink', [{ key: 'drink', value: drink }], next, { 'q1.drink': drink, 'q1.price-confirmed': false }));
const confirmation = (['tea', 'water'] as const).map((drink) => intent('confirm_drink_price', [{ key: 'drink', value: drink }, { key: 'priceCny', value: drink === 'tea' ? 10 : 5 }], 'q1.receipt', { 'q1.price-confirmed': true }, { 'q1.drink': drink }));
const q1 = [
  node('q1.order', 'Find a drink vendor and ask for a drink.', [], [intent('order_drink', [{ key: 'drink', value: 'coffee' }], 'q1.substitute', { 'q1.coffee-unavailable': true }), ...drinks('q1.receipt'), cancel()]),
  node('q1.substitute', 'Coffee is sold out: choose tea or water.', [], [
    ...(['tea', 'water'] as const).map((drink) => intent('accept_substitute', [{ key: 'drink', value: drink }], 'q1.receipt', { 'q1.drink': drink, 'q1.price-confirmed': false })), ...drinks('q1.receipt'), cancel(),
  ]),
  // The engine checks money, the vendor anchor, and records the purchase before this transition fires.
  node('q1.receipt', 'Confirm the drink and price, then pay.', [action({ type: 'choose', choiceId: 'q1.pay' }, null, {}, { 'q1.price-confirmed': true, 'q1.paid': true }, 'clear')], [...confirmation, ...drinks('q1.receipt'), cancel()]),
];
// Q2 completes only when the engine has stored a verified route (q2.route-verified) for this request.
const q2 = [
  node('q2.ask', 'Ask a local how to get to Shanghai Grand Hotel (上海大酒店).', [], [intent('ask_directions', [{ key: 'destination', value: 'grand-hotel' }], null, {}, { 'q2.route-verified': true }, 'clear')]),
];
// Q3: accepted request → stand on the spot and start the countdown → verified capture.
const q3 = [
  node('q3.ask', 'By the Huangpu River (黄浦江), ask a passerby to take your photo.', [], [intent('request_photo', [], 'q3.pose', {}, { 'q3.request-accepted': true })]),
  node('q3.pose', 'Stand at the photo spot with the river behind you.', [action({ type: 'choose', choiceId: 'q3.start-photo' }, 'q3.capture')], [intent('request_photo', [], 'q3.pose', {}, { 'q3.request-accepted': true })]),
  node('q3.capture', 'Hold still for the countdown.', [
    action({ type: 'photoCapture', outcome: 'captured' }, null, {}, { 'q3.capture-verified': true }, 'clear'),
    action({ type: 'photoCapture', outcome: 'failed' }, 'q3.pose'),
    action({ type: 'choose', choiceId: 'q3.start-photo' }, 'q3.capture'),
  ]),
];
const hints: Record<string, readonly [string, string, string]> = {
  'q1.order': ['Ask the vendor for a drink.', '茶 means tea; 水 means water.', '我要水。'],
  'q1.substitute': ['Coffee is unavailable; choose a different drink.', '卖完了 means sold out.', '那就茶吧。'],
  'q1.receipt': ['Confirm the drink and its price, then pay.', '茶十元 means tea costs ten yuan; 水五元 means water costs five yuan.', '水五元。'],
  'q2.ask': ['Ask a local for directions to the hotel.', '怎么走 means how do I get there.', '请问，去上海大酒店怎么走？'],
  'q3.ask': ['Find someone by the river and ask for a photo.', '拍张照 means take a photo.', '可以帮我在这里拍张照吗？'],
  'q3.pose': ['Walk to the photo spot.', '那边 means over there.', 'Stand on the marked spot by the railing.'],
  'q3.capture': ['Stay on the spot until the countdown ends.', '一、二、三 means one, two, three.', 'Hold still for three seconds.'],
};
const definitions = [
  { id: 'Q1', title: 'Buy a drink', nodes: q1, tracks: ['reading', 'conversation'], cues: ['q1.menu'], snapshot: 'q1.drinks', choices: ['q1.pay'], roles: ['vendor'], xp: 100, hint: 1 },
  { id: 'Q2', title: 'Find Shanghai Grand Hotel', nodes: q2, tracks: ['reading', 'conversation'], cues: ['q2.hotel-sign'], snapshot: 'q2.hotel', choices: [], roles: ['guide'], xp: 100, hint: 0 },
  { id: 'Q3', title: 'Photo at the Huangpu River', nodes: q3, tracks: ['reading', 'conversation'], cues: ['q3.river-sign'], snapshot: 'q3.photo', choices: ['q3.start-photo'], roles: ['passerby'], xp: 150, hint: 0 },
] as const;

export const NEXT_MISSION: Record<MissionId, MissionId | null> = { Q1: 'Q2', Q2: 'Q3', Q3: null };
export const missionSnapshot: Record<MissionId, keyof typeof authoredFacts> = { Q1: 'q1.drinks', Q2: 'q2.hotel', Q3: 'q3.photo' };

export const missions: readonly MissionDefinition[] = definitions.map((definition) => MissionDefinitionSchema.parse({
  id: definition.id, mode: 'practice', title: definition.title, startNode: definition.nodes[0]!.id, nodes: definition.nodes,
  reward: { id: `${definition.id.toLowerCase()}.clear`, xp: definition.xp, items: { hint: definition.hint }, ...(definition.id === 'Q3' ? { badge: 'shanghai-explorer' } : {}) },
  prerequisiteMissionIds: definition.id === 'Q1' ? [] : [definition.id === 'Q2' ? 'Q1' : 'Q2'], allowedActionIds: definition.choices, npcRoles: definition.roles,
  variants: [0, 1, 2].map((tier) => ({ tier, factSnapshots: [{ id: definition.snapshot, facts: authoredFacts[definition.snapshot] }], targetTracks: definition.tracks, cueIds: definition.cues })),
  hints: definition.nodes.flatMap((entry) => [1, 2, 3].map((level) => ({ id: `${entry.id}.hint-${level}`, nodeId: entry.id, level, text: hints[entry.id]![level - 1] }))),
}));

export function missionFor(id: MissionId): MissionDefinition {
  const mission = missions.find((entry) => entry.id === id);
  if (!mission) throw new Error(`Unknown mission ${id}`);
  return mission;
}
