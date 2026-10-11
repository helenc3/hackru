import type { MissionId, PublicState } from '@vibequest/shared';
import { fixtureState, type Step } from '../ui/scripted-api';

// Response tapes for the validation-harness journeys of the three exploration quests. They script
// the server's replies; they do not certify the engine, the city generator, or the AI.
const done = (missionId: MissionId, xp: number, extra: Partial<PublicState> = {}): Partial<PublicState> => ({
  status: 'cleared', xp, completedMissionIds: (['Q1', 'Q2', 'Q3'] as const).slice(0, (['Q1', 'Q2', 'Q3'] as const).indexOf(missionId) + 1),
  unlockedMissionIds: ['Q1', 'Q2', 'Q3'], objectives: [{ id: 'fixture.complete', label: 'Required objectives completed.', complete: true }], ...extra,
});
/** startMission patch: the next quest's NPC anchors near the player, keeping validation identity and XP. */
export const missionPatch = (missionId: MissionId, xp: number, previous: Partial<PublicState> = {}): Partial<PublicState> => {
  // The session started as Q1; a new quest keeps that session ID.
  return { ...fixtureState(missionId, true), sessionId: 'ui-validation-Q1', xp, ...previous };
};
export const directions = { routeId: 'route-ui', fromAnchorId: 'ui.guide', hotelAnchorId: 'hotel.grand', textZh: '沿着南京路往东走，上海大酒店在右边。', steps: [{ textZh: '沿着南京路往东走', english: 'Walk east along Nanjing Road' }, { textZh: '上海大酒店在右边', english: 'The hotel is on the right' }] };
export const photo = { id: 'photo-ui', passerbyAnchorId: 'ui.passerby', viewpointAnchorId: 'ui.viewpoint', spot: { x: 20, z: 20 }, status: 'accepted' as const, attempts: 0 };

export function drinkSteps(): Step[] {
  return [
    { action: { type: 'inspect', targetId: 'ui.menu' }, patch: { visibleCues: [{ id: 'q1.menu', label: '菜单', text: '茶 十元\n水 五元\n咖啡 卖完了' }] } },
    { text: '我要咖啡。', reply: '咖啡卖完了。我们有茶和水。', feedback: true },
    { text: '那我要水，五元，对吗？', reply: '对，一杯水五元。', feedback: true },
    { action: { type: 'choose', choiceId: 'q1.pay', anchorId: 'ui.vendor' }, patch: done('Q1', 100, { inventory: { hint: 1, cny: 15, drinks: ['water'] } }), event: 'Bought water for ¥5.' },
  ];
}
export function hotelSteps(): Step[] {
  return [{ text: '请问，去上海大酒店怎么走？', reply: directions.textZh, feedback: true, patch: { ...done('Q2', 200), directions } }];
}
export function photoSteps(): Step[] {
  return [
    { text: '可以帮我在这里拍张照吗？', reply: '好的！站在那边。', feedback: true, patch: { photo } },
    { action: { type: 'choose', choiceId: 'q3.start-photo', anchorId: 'ui.viewpoint' }, patch: { photo: { ...photo, status: 'countdown', countdownEndsAtMs: Date.now() + 500 } } },
    // Matches either outcome: this tape checks the acknowledgment round trip, not the canvas capture.
    { action: { type: 'photoCapture', photoRequestId: 'photo-ui' }, patch: done('Q3', 300, { photo: { ...photo, status: 'captured', attempts: 1 }, badges: ['shanghai-explorer'] }) },
  ];
}
