import { createBaselineState, type MissionId, type PublicState } from '@vibequest/shared';
import type { Step } from '../ui/scripted-api';
const cue = (id: PublicState['visibleCues'][number]['id'], label: string, text: string) => ({ id, label, text });
export const cleared = (xp: number): Partial<PublicState> => ({ status: 'cleared', xp, objectives: [{ id: 'fixture.complete', label: 'Required objectives completed.', complete: true }] });
export const missionPatch = (missionId: MissionId, xp: number): Partial<PublicState> => ({ ...createBaselineState(missionId), sessionId: 'ui-validation-P1', validationMode: true, xp });

export function cafeSteps(kiosk = false): Step[] {
  return [
    { action: { type: 'inspect', targetId: 'p1.entrance-sign' }, patch: { visibleCues: [cue('p1.entrance-sign', '入口告示', '请从广场进入。这扇门关闭了。')] } },
    { text: '我要咖啡。', reply: '咖啡卖完了。我们有茶和水。', feedback: true },
    ...(kiosk ? [{ text: '不用了，谢谢。', reply: '售货亭也有茶和水。', feedback: true }, { text: '我要水，五元，对吗？', reply: '对。请到售货亭付款，然后去车站。', feedback: true }, { action: { type: 'choose' as const, choiceId: 'p1.go-kiosk' as const } }] : [{ text: '那我要水，五元，对吗？', reply: '对，一杯水五元。', feedback: true }]),
    { action: { type: 'choose', choiceId: kiosk ? 'p1.pay-kiosk' : 'p1.pay-cafe' }, event: 'Receipt acquired. Follow the spoken directions to the station.' },
    { action: { type: 'moveZone', zoneId: 'concourse' }, patch: { ...cleared(80), inventory: { hint: 1, freeze: 0 } } },
  ];
}
export function platformSteps(confirmation = false, wrongFirst = false): Step[] {
  return [
    { action: { type: 'inspect', targetId: 'p2.timetable' }, patch: { visibleCues: [cue('p2.timetable', '列车时刻表', '江滨 — 二号站台 — 14:30')] } },
    { text: '去江滨的车在哪个站台？', reply: '去江滨的车在二号站台。', feedback: true },
    { action: { type: 'playCue', cueId: 'p2.platform-change', channel: 'validation-text' }, patch: { visibleCues: [cue('p2.platform-change', '车站广播', '请注意：开往江滨的列车改到三号站台，不是二号站台。')] }, event: 'Developer transcript delivered; no independent listening evidence.' },
    ...(confirmation ? [{ text: '是三号站台吗？', reply: '对，去三号站台。', feedback: true }] : []),
    ...(wrongFirst ? [{ action: { type: 'choose' as const, choiceId: 'p2.board-2' as const }, event: '这趟车去机场。Return to the station and try again.' }] : []),
    { action: { type: 'choose', choiceId: 'p2.board-3' }, patch: { ...cleared(180), inventory: { hint: 1, freeze: 1 } } },
  ];
}
export function bossSteps(fail = false): Step[] {
  return [
    { action: { type: 'inspect', targetId: 'b1.destination-board' }, patch: { visibleCues: [cue('b1.destination-board', '目的地看板', '海港 — 一号站台\n机场 — 二号站台\n江滨 — 三号站台')] } },
    { text: '我要一张去海港的票。', reply: '一张去海港的票，十五元。' },
    { action: { type: 'choose', choiceId: 'b1.pay-ticket' }, event: '车票已购买。' },
    { action: { type: 'playCue', cueId: 'b1.harbor-change', channel: 'validation-text' }, patch: { visibleCues: [cue('b1.harbor-change', '车站广播', '开往海港的列车改到二号站台。一号站台的列车不再发车。')] } },
    { action: { type: 'choose', choiceId: fail ? 'b1.board-1' : 'b1.board-2' }, patch: fail ? { status: 'failed', badges: [] } : { ...cleared(330), badges: ['station-navigator'] } },
  ];
}
