import { z } from 'zod';
import { CueDefinitionSchema, NpcDefinitionSchema, type CueDefinition, type NpcDefinition } from '../contracts.js';
import { missions } from './missions.js';

export { missions };
// Voice metadata belongs to authored characters, outside the frozen wire contract. Only approved IDs (docs/MANDARIN_VOICES.md).
const voicedNpcSchema = NpcDefinitionSchema.extend({ voice: z.object({ id: z.string().min(1), description: z.string().min(1) }) });
export const characterDescriptions: readonly (NpcDefinition & { voice: { id: string; description: string } })[] = [
  { id: 'vendor', nameZh: '老王', persona: 'Warm, encouraging drink vendor. Reply in short Mandarin phrases grounded in the available drinks and prices. Keep the conversation moving toward one goal: the customer names a drink, you state its price, then they pay with the Pay button. After greetings or unclear turns, ask what they would like to drink (你想喝什么？).', initialPatience: 5, voiceKey: 'vendor', voice: { id: 'Ca5bKgudqKJzq8YRFoAz', description: 'Coco Li — Calm, Young and Trustworthy' }, allowedIntents: ['order_drink', 'accept_substitute', 'cancel_order', 'confirm_drink_price', 'request_repeat', 'greeting', 'farewell', 'unknown'] },
  { id: 'guide', nameZh: '小李', persona: 'Helpful local resident who knows the neighbourhood. Answer in concise Mandarin. Never invent roads, turns, or distances: the game supplies the verified route.', initialPatience: 4, voiceKey: 'guide', voice: { id: '4VZIsMPtgggwNg7OXbPY', description: 'James Gao — Calm, Friendly and Warm' }, allowedIntents: ['ask_directions', 'request_repeat', 'greeting', 'farewell', 'unknown'] },
  { id: 'passerby', nameZh: '小美', persona: 'Friendly passer-by strolling along the river. Happy to help with a photo; replies in short, cheerful Mandarin.', initialPatience: 4, voiceKey: 'passerby', voice: { id: '5mZxJZhSmJTjL7GoYfYI', description: 'Karo Yang — Clear, Lively and Energetic' }, allowedIntents: ['request_photo', 'request_repeat', 'greeting', 'farewell', 'unknown'] },
].map((npc) => voicedNpcSchema.parse(npc));

export const npcs: readonly NpcDefinition[] = characterDescriptions.map((npc) => NpcDefinitionSchema.parse(Object.fromEntries(Object.entries(npc).filter(([key]) => key !== 'voice'))));

export const audioVoices = {
  pa: { id: 'agczkAUlHLowaNnL72Cc', description: 'Adrian — Mandarin PA narration' },
  setup: { ...characterDescriptions.find((npc) => npc.id === 'vendor')!.voice },
} as const;

// Keep review pending until a Mandarin-capable reviewer checks the text.
export const cues: readonly CueDefinition[] = [
  { id: 'q1.menu', missionId: 'Q1', kind: 'sign', label: '饮料价目表', textZh: '茶 十元\n水 五元\n咖啡 卖完了', englishMeaning: 'Tea ¥10 · Water ¥5 · Coffee sold out', factSnapshotId: 'q1.drinks', review: 'pending' },
  { id: 'q2.hotel-sign', missionId: 'Q2', kind: 'sign', label: '上海大酒店', textZh: '上海大酒店', englishMeaning: 'Shanghai Grand Hotel', factSnapshotId: 'q2.hotel', review: 'pending' },
  { id: 'q3.river-sign', missionId: 'Q3', kind: 'sign', label: '黄浦江观景台', textZh: '黄浦江观景台\n拍照点', englishMeaning: 'Huangpu River viewing deck · Photo spot', factSnapshotId: 'q3.photo', review: 'pending' },
].map((cue) => CueDefinitionSchema.parse(cue));

for (const mission of missions) {
  const referencedChoices = new Set(mission.nodes.flatMap((entry) => entry.actionTransitions.flatMap((transition) => transition.trigger.choiceId ? [transition.trigger.choiceId] : [])));
  if (mission.allowedActionIds.some((id) => !referencedChoices.has(id)) || [...referencedChoices].some((id) => !mission.allowedActionIds.includes(id))) throw new Error(`Choice references disagree in ${mission.id}`);
  for (const variant of mission.variants) for (const cueId of variant.cueIds) if (!cues.some((cue) => cue.id === cueId && cue.missionId === mission.id)) throw new Error(`Unresolved cue: ${cueId}`);
}

export { authoredFacts, groundedReplies, speakMandarinReplies, clarifyReplies, npcOpeners, DRINK_PRICES, STARTING_CNY } from './facts.js';
export { NEXT_MISSION, missionSnapshot } from './missions.js';
