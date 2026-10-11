import { CueDefinitionSchema, NpcDefinitionSchema, type CueDefinition, type NpcDefinition } from '../contracts.js';
import { sceneManifest } from './scene-manifest.js';
import { missions } from './missions.js';

export { missions };
export const npcs: readonly NpcDefinition[] = [
  { id: 'xiaolin', nameZh: '小林', persona: 'Warm, encouraging café owner. Reply in short Mandarin phrases grounded in the available drinks and prices. Keep the conversation moving toward one goal: the customer names a drink, confirms its price, then pays. After greetings or unclear turns, ask what they would like to drink.', initialPatience: 5, zoneId: 'cafe', position: { x: -10, z: 4 }, voiceKey: 'xiaolin', allowedIntents: ['order_drink', 'accept_substitute', 'cancel_order', 'confirm_drink_price', 'ask_direction', 'request_repeat', 'greeting', 'farewell', 'unknown'] },
  { id: 'achen', nameZh: '阿陈', persona: 'Helpful, matter-of-fact station worker. Give concise Mandarin directions from the current platform facts.', initialPatience: 4, zoneId: 'concourse', position: { x: -3, z: 0 }, voiceKey: 'achen', allowedIntents: ['ask_direction', 'confirm_platform', 'request_repeat', 'greeting', 'farewell', 'unknown'] },
  { id: 'laozhou', nameZh: '老周', persona: 'Busy, formal ticket agent. Ask for missing destination or quantity in Mandarin; never offer English coaching in the boss.', initialPatience: 3, zoneId: 'concourse', position: { x: 3, z: 0 }, voiceKey: 'laozhou', allowedIntents: ['buy_ticket', 'confirm_ticket', 'ask_direction', 'confirm_platform', 'request_repeat', 'greeting', 'farewell', 'unknown'] },
].map((npc) => NpcDefinitionSchema.parse(npc));

const cueText = [
  { id: 'p1.entrance-sign', missionId: 'P1', kind: 'sign', textZh: '请从广场进入。这扇门关闭了。', englishMeaning: 'Please enter from the plaza. This door is closed.', factSnapshotId: 'p1.cafe' },
  { id: 'p1.station-directions', missionId: 'P1', kind: 'directions', textZh: '从广场走到车站。进去后，售票处在右边。', englishMeaning: 'Walk from the plaza to the station. Inside, the ticket counter is on the right.', factSnapshotId: 'p1.cafe', audioAssetId: 'p1.station-directions' },
  { id: 'p2.timetable', missionId: 'P2', kind: 'sign', textZh: '江滨 — 二号站台 — 14:30', englishMeaning: 'Jiangbin — platform 2 — 14:30.', factSnapshotId: 'p2.original' },
  { id: 'p2.platform-change', missionId: 'P2', kind: 'pa', textZh: '请注意：开往江滨的列车改到三号站台，不是二号站台。', englishMeaning: 'Attention: the Jiangbin train has moved to platform 3, not platform 2.', factSnapshotId: 'p2.updated', audioAssetId: 'p2.platform-change' },
  { id: 'b1.destination-board', missionId: 'B1', kind: 'sign', textZh: '海港 — 一号站台\n机场 — 二号站台\n江滨 — 三号站台', englishMeaning: 'Haigang — platform 1; Airport — platform 2; Jiangbin — platform 3.', factSnapshotId: 'b1.original' },
  { id: 'b1.harbor-change', missionId: 'B1', kind: 'pa', textZh: '开往海港的列车改到二号站台。一号站台的列车不再发车。', englishMeaning: 'The Haigang train has moved to platform 2. Trains at platform 1 no longer depart.', factSnapshotId: 'b1.updated', audioAssetId: 'b1.harbor-change' },
] as const;

// IDs name future audio assets; they do not assert that audio has been produced.
// Keep review pending until a Mandarin-capable reviewer checks text and audio.
export const cues: readonly CueDefinition[] = cueText.map((cue) => {
  const target = sceneManifest.interactables.find((entry) => entry.id === cue.id);
  if (!target) throw new Error(`Cue has no scene location: ${cue.id}`);
  const simple = cue.id === 'p2.platform-change' ? ['江滨的列车改到三号站台。', 'The Jiangbin train has moved to platform 3.']
    : cue.id === 'p1.station-directions' ? ['走到车站。售票处在右边。', 'Walk to the station. The ticket counter is on the right.']
      : [cue.textZh, cue.englishMeaning];
  const harder = cue.id === 'p2.platform-change' ? [cue.textZh + '二号站台的车去机场。', cue.englishMeaning + ' The train at platform 2 goes to the airport.'] : [cue.textZh, cue.englishMeaning];
  return CueDefinitionSchema.parse({ ...cue, label: target.label, zoneId: target.zoneId, position: target.position, review: 'pending', variants: (cue.missionId === 'B1' ? [1] : [0, 1, 2]).map((tier) => ({ tier, textZh: tier === 0 ? simple[0] : tier === 2 ? harder[0] : cue.textZh, englishMeaning: tier === 0 ? simple[1] : tier === 2 ? harder[1] : cue.englishMeaning, ...('audioAssetId' in cue ? { audioAssetId: `${cue.audioAssetId}.tier-${tier}` } : {}) })) });
});

// Validate cross-module references as well as graph reachability at load time.
for (const mission of missions) {
  const referencedChoices = new Set(mission.nodes.flatMap((node) => node.actionTransitions.flatMap((entry) => entry.trigger.type === 'choose' ? [entry.trigger.choiceId] : [])));
  if (mission.allowedActionIds.some((id) => !referencedChoices.has(id)) || [...referencedChoices].some((id) => !mission.allowedActionIds.includes(id))) throw new Error(`Choice references disagree in ${mission.id}`);
  for (const variant of mission.variants) for (const cueId of variant.cueIds) {
    if (!cues.some((cue) => cue.id === cueId && cue.missionId === mission.id && variant.factSnapshots.some((snapshot) => snapshot.id === cue.factSnapshotId))) throw new Error(`Unresolved cue snapshot: ${cueId}`);
  }
}

export { authoredFacts, groundedReplies, speakMandarinReplies, clarifyReplies } from './facts.js';
export { sceneManifest } from './scene-manifest.js';
