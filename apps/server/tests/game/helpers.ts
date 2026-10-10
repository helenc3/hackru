import { expect } from 'vitest';
import request from 'supertest';
import type { GameAction, PublicState } from '@vibequest/shared';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createServices } from '../../src/services.js';

export function fixtureApp() {
  const services = createServices(loadConfig({ NODE_ENV: 'test', ENABLE_DEMO_FIXTURES: 'true', ENABLE_VALIDATION_HARNESS: 'true' }));
  return { services, app: createApp({ services }) };
}
export async function campaign(providerMode: 'fixture' | 'live' = 'fixture') {
  const { app, services } = fixtureApp();
  const created = await request(app).post('/api/sessions').send({ initialTier: 1, providerMode, validationMode: true }).expect(201);
  let state: PublicState = created.body.state;
  let count = 0;
  const act = async (action: GameAction, status = 200) => {
    const response = await request(app).post(`/api/sessions/${state.sessionId}/actions`).send({ actionId: `action-${++count}`, expectedVersion: state.version, action }).expect(status);
    if (response.body.state) state = response.body.state;
    return response;
  };
  const talk = async (text: string, npcId: 'xiaolin' | 'achen' | 'laozhou' = 'xiaolin', status = 200) => {
    const response = await request(app).post(`/api/sessions/${state.sessionId}/turns`).send({ turnId: `turn-${++count}`, expectedVersion: state.version, npcId, input: { text, source: 'typed' } }).expect(status);
    if (response.body.state) state = response.body.state;
    return response;
  };
  return { app, services, act, talk, get state() { return state; }, move: (zoneId: Extract<GameAction, { type: 'moveZone' }>['zoneId']) => act({ type: 'moveZone', zoneId }), choose: (choiceId: Extract<GameAction, { type: 'choose' }>['choiceId'], status = 200) => act({ type: 'choose', choiceId }, status), inspect: (targetId: Extract<GameAction, { type: 'inspect' }>['targetId']) => act({ type: 'inspect', targetId }), cue: (cueId: Extract<GameAction, { type: 'playCue' }>['cueId']) => act({ type: 'playCue', cueId, channel: 'validation-text' }) };
}
export type Campaign = Awaited<ReturnType<typeof campaign>>;
export async function p1(game: Campaign, kiosk = false) {
  await game.move('cafe'); await game.inspect('p1.entrance-sign'); await game.choose('p1.enter-plaza-door');
  await game.talk('我要咖啡。');
  if (kiosk) { await game.talk('取消订单。'); await game.talk('我要水。'); await game.talk('水五元。'); }
  else { await game.talk('那就茶吧。'); await game.talk('茶十元。'); }
  if (kiosk) { await game.cue('p1.station-directions'); await game.move('kiosk'); await game.choose('p1.go-kiosk'); await game.choose('p1.pay-kiosk'); }
  else { await game.choose('p1.pay-cafe'); await game.cue('p1.station-directions'); }
  expect(game.state.status).toBe('active');
  await game.move('concourse'); expect(game.state.status).toBe('cleared');
}
export async function p2(game: Campaign, wrong = false, clarify = false) {
  await game.act({ type: 'startMission', missionId: 'P2' });
  await game.inspect('p2.timetable'); await game.talk('去江滨的车在哪个站台？', 'achen'); await game.cue('p2.platform-change');
  if (clarify) await game.talk('是三号站台吗？', 'achen');
  if (wrong) { await game.move('platform-2'); await game.choose('p2.board-2'); expect(game.state.status).toBe('active'); await game.move('concourse'); }
  await game.move('platform-3'); await game.choose('p2.board-3'); expect(game.state.status).toBe('cleared');
}
export async function b1Ticket(game: Campaign) {
  await game.act({ type: 'startMission', missionId: 'B1' });
  await game.inspect('b1.destination-board');
  const turn = await game.talk('我要一张去海港的票。', 'laozhou');
  expect(turn.body.feedback).toBeUndefined(); expect(turn.body.vibe).toBeUndefined();
  await game.choose('b1.pay-ticket', 422);
  await game.talk('海港，一张。', 'laozhou'); await game.choose('b1.pay-ticket'); await game.cue('b1.harbor-change');
}

