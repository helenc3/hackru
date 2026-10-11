import { MissionDefinitionSchema, type ActionTransition, type IntentTransition, type MissionDefinition, type MissionId, type MissionNode } from '../contracts.js';
import { authoredFacts } from './facts.js';

const action = (trigger: ActionTransition['trigger'], nextNode: string | null, setFlags: ActionTransition['setFlags'] = {}, requiredFlags: ActionTransition['requiredFlags'] = {}, result: ActionTransition['result'] = 'none'): ActionTransition => ({ trigger, nextNode, setFlags, requiredFlags, result, guards: [] });
const intent = (name: IntentTransition['trigger']['intent'], slots: IntentTransition['trigger']['slots'], nextNode: string | null, setFlags: IntentTransition['setFlags'] = {}, requiredFlags: IntentTransition['requiredFlags'] = {}, result: IntentTransition['result'] = 'none'): IntentTransition => ({ trigger: { intent: name, slots }, nextNode, setFlags, requiredFlags, result, guards: [] });
const node = (id: string, objective: string, actionTransitions: ActionTransition[], intentTransitions: IntentTransition[] = []): MissionNode => ({ id, objective, actionTransitions, intentTransitions, checkpoint: true });

// Each quest is one goal. Q1: ask 老王 for an available drink (he states the price), then pay; the first purchase completes it.
// Coffee being sold out is dialogue, not a step. The engine checks money and the vendor anchor before the pay transition fires.
// A spoken confirmation must carry the right price (茶十元); a wrong price is a miss, not an order.
const order = (name: 'order_drink' | 'accept_substitute' | 'confirm_drink_price', drink: 'tea' | 'water') => intent(name, [{ key: 'drink', value: drink }, ...(name === 'confirm_drink_price' ? [{ key: 'priceCny' as const, value: drink === 'tea' ? 10 : 5 }] : [])], 'q1.buy', { 'q1.drink': drink });
const q1 = [
  node('q1.buy', 'Buy a drink from 老王 (Lao Wang).', [action({ type: 'choose', choiceId: 'q1.pay' }, null, {}, { 'q1.paid': true }, 'clear')], [
    intent('order_drink', [{ key: 'drink', value: 'coffee' }], 'q1.buy', { 'q1.coffee-unavailable': true }),
    ...(['order_drink', 'accept_substitute', 'confirm_drink_price'] as const).flatMap((name) => (['tea', 'water'] as const).map((drink) => order(name, drink))),
    intent('cancel_order', [], 'q1.buy', { 'q1.drink': '' }),
  ]),
];
// Q2 completes only when the engine has stored a verified route (q2.route-verified) for this request.
const q2 = [
  node('q2.ask', 'Ask 小李 (Xiao Li) how to get to 上海大酒店 (Shanghai Grand Hotel).', [], [intent('ask_directions', [{ key: 'destination', value: 'grand-hotel' }], null, {}, { 'q2.route-verified': true }, 'clear')]),
];
// Q3 is one goal; the photo spot, countdown and capture are guided inline. Completion needs a verified capture.
const q3 = [
  node('q3.photo', 'Ask a passer-by at the Huangpu River (黄浦江) to take your photo.', [
    action({ type: 'choose', choiceId: 'q3.start-photo' }, 'q3.photo', {}, { 'q3.request-accepted': true }),
    action({ type: 'photoCapture', outcome: 'captured' }, null, {}, { 'q3.capture-verified': true }, 'clear'),
    action({ type: 'photoCapture', outcome: 'failed' }, 'q3.photo'),
  ], [intent('request_photo', [], 'q3.photo', {}, { 'q3.request-accepted': true })]),
];
const hints: Record<string, readonly [string, string, string]> = {
  'q1.buy': ['Ask 老王 for a drink, then press Pay.', '茶 means tea; 水 means water. Coffee (咖啡) is sold out.', '我要水。'],
  'q2.ask': ['Ask 小李 for directions to the hotel.', '怎么走 means how do I get there.', '请问，去上海大酒店怎么走？'],
  'q3.photo': ['Find a passer-by by the river and ask for a photo, then stand on the marked spot.', '拍张照 means take a photo.', '可以帮我在这里拍张照吗？'],
};
const definitions = [
  { id: 'Q1', title: 'Buy a drink from Lao Wang', nodes: q1, tracks: ['reading', 'conversation'], cues: ['q1.menu'], snapshot: 'q1.drinks', choices: ['q1.pay'], roles: ['vendor'], xp: 100, hint: 1 },
  { id: 'Q2', title: 'Ask Xiao Li the way', nodes: q2, tracks: ['reading', 'conversation'], cues: ['q2.hotel-sign'], snapshot: 'q2.hotel', choices: [], roles: ['guide'], xp: 100, hint: 0 },
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
