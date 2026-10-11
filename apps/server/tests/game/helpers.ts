import { expect, vi } from 'vitest';
import { GOAL_WARMUP_EXCHANGES, pacingReplies } from '@vibequest/shared';
import request from 'supertest';
import type { Anchor, Directions, GameAction, NpcId, Position, PublicState, WorldInfo, WorldView } from '@vibequest/shared';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createServices, type ServerServices } from '../../src/services.js';
import type { WorldService } from '../../src/city/world-service.js';

// Moves are clocked by the server; tests advance a Date.now offset instead of sleeping.
const realNow = Date.now.bind(Date);
export const clock = { offset: 0 };
vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clock.offset);
export const advance = (ms: number) => { clock.offset += Math.round(ms); };

type FakeAnchor = Anchor & { position: Position; chunk: string };
const anchor = (id: string, capability: Anchor['capability'], kind: Anchor['kind'], x: number, z: number, extra: Partial<Anchor> = {}): FakeAnchor =>
  ({ id, placementId: `${id}.placement`, capability, kind, x: x + 20, z: z + 20, position: { x, z }, chunk: '0,0', ...extra });

/** A flat test street around spawn: vendor + menu at spawn, a guide, the river viewpoint with a passer-by, and a lone passer-by far from water. */
export const ANCHORS = {
  vendor: anchor('an.vendor.spawn', 'drink-vendor', 'npc', 1, 0, { role: 'vendor', nameKey: 'laowang' }),
  farVendor: anchor('an.vendor.far', 'drink-vendor', 'npc', 40, 0, { role: 'vendor', nameKey: 'laowang' }),
  menu: anchor('an.sign.menu', 'readable-sign', 'sign', 0, 1, { cueId: 'q1.menu' }),
  guide: anchor('an.helper.street', 'direction-helper', 'npc', 6, 0, { role: 'guide', nameKey: 'laowang' }),
  hotel: anchor('hotel.grand', 'hotel-landmark', 'landmark', 80, 0, { nameKey: 'grand-hotel' }),
  viewpoint: anchor('an.viewpoint.river', 'river-viewpoint', 'photo-spot', 14, 0, { cueId: 'q3.river-sign' }),
  passerby: anchor('an.npc.riverside', 'photo-passerby', 'npc', 12, 0, { role: 'passerby', nameKey: 'xiaomei' }),
  lonely: anchor('an.npc.inland', 'photo-passerby', 'npc', 30, 20, { role: 'passerby', nameKey: 'xiaoli' }),
} as const;
export const ROUTE: Directions = {
  routeId: 'route.test', fromAnchorId: ANCHORS.guide.id, hotelAnchorId: 'hotel.grand',
  textZh: '沿着南京路往东走两个路口，上海大酒店在左边。',
  steps: [{ textZh: '沿着南京路往东走两个路口', english: 'Walk east along Nanjing Road for two blocks' }, { textZh: '上海大酒店在左边', english: 'The Shanghai Grand Hotel is on the left' }],
};
/** Committed land is |x|,|z| ≤ 100 minus a wall at x ∈ [-5, -4]; beyond is uncommitted. */
export const WALL = { minX: -5, maxX: -4, minZ: -10, maxZ: 10 };

export function fakeWorldView(worldId = 'w-test'): WorldView {
  const all = Object.values(ANCHORS);
  return {
    worldId,
    walkable: ({ x, z }) => Math.abs(x) <= 100 && Math.abs(z) <= 100 && !(x >= WALL.minX - 0.35 && x <= WALL.maxX + 0.35 && z >= WALL.minZ && z <= WALL.maxZ),
    committed: ({ cx, cz }) => Math.abs(cx) <= 2 && Math.abs(cz) <= 2,
    districtAt: ({ x }) => x >= 10 ? 'waterfront' : 'shopping',
    anchor: (id) => all.find((entry) => entry.id === id),
    anchorsNear: (position, radius) => all.filter((entry) => Math.hypot(entry.position.x - position.x, entry.position.z - position.z) <= radius),
    directionsToHotel: (fromAnchorId) => fromAnchorId === ANCHORS.guide.id ? ROUTE : null,
  };
}
export function fakeWorldService(): WorldService {
  const info = (worldId = 'w-test'): WorldInfo => ({ worldId, seed: 'seed-test', generatorVersion: 1, catalogVersion: 'catalog-1', spawn: { x: 0, z: 0 }, hotelAnchorId: 'hotel.grand' });
  return {
    provider: 'fallback',
    open: (worldId) => info(worldId),
    view: (worldId) => fakeWorldView(worldId),
    request: () => Promise.reject(new Error('Chunk generation is outside game tests.')),
    restore: () => { throw new Error('Chunk restore is outside game tests.'); },
  };
}
export function fakeServices(environment: Record<string, string> = { NODE_ENV: 'test', ENABLE_DEMO_FIXTURES: 'true', ENABLE_VALIDATION_HARNESS: 'true' }): ServerServices {
  return { ...createServices(loadConfig(environment)), worlds: fakeWorldService() };
}
export function fixtureApp() {
  const services = fakeServices();
  return { services, app: createApp({ services }) };
}

export async function campaign(providerMode: 'fixture' | 'live' = 'fixture', validationMode = false) {
  const { app, services } = fixtureApp();
  const created = await request(app).post('/api/sessions').send({ initialTier: 1, providerMode, validationMode }).expect(201);
  let state: PublicState = created.body.state;
  let position: Position = { x: 0, z: 0 };
  let count = 0;
  const act = async (action: GameAction, status = 200) => {
    const response = await request(app).post(`/api/sessions/${state.sessionId}/actions`).send({ actionId: `action-${++count}`, expectedVersion: state.version, action }).expect(status);
    if (response.body.state) state = response.body.state;
    return response;
  };
  /** Walks in one straight move after letting enough time pass at the authored speed. */
  const walkTo = async (target: Position, status = 200) => {
    advance(Math.hypot(target.x - position.x, target.z - position.z) / 4 * 1000 + 50);
    const response = await act({ type: 'move', position: target }, status);
    if (status === 200) position = target;
    return response;
  };
  const talk = async (text: string, npcId: NpcId = 'vendor', anchorId: string = { vendor: ANCHORS.vendor.id, guide: ANCHORS.guide.id, passerby: ANCHORS.passerby.id }[npcId], status = 200) => {
    const response = await request(app).post(`/api/sessions/${state.sessionId}/turns`).send({ turnId: `turn-${++count}`, expectedVersion: state.version, npcId, anchorId, input: { text, source: 'typed' } }).expect(status);
    if (response.body.state) state = response.body.state;
    return response;
  };
  const session = async () => (await services.sessionStore.get(state.sessionId))!;
  /** Skip the goal warm-up for the current attempt (mechanics tests; the q1/q2/q3 journeys do the real warm-up). */
  const warm = () => services.sessionStore.withSession(state.sessionId, async (record) => {
    for (const role of ['vendor', 'guide', 'passerby']) record.state.flags[`session.warmed-${role}`] = true;
  });
  return {
    app, services, act, talk, walkTo, session, warm, get state() { return state; }, get position() { return position; },
    pay: (anchorId: string = ANCHORS.vendor.id, status = 200) => act({ type: 'choose', choiceId: 'q1.pay', anchorId }, status),
    startPhoto: (status = 200) => act({ type: 'choose', choiceId: 'q3.start-photo', anchorId: ANCHORS.viewpoint.id }, status),
    capture: (outcome: 'captured' | 'failed', status = 200, imageDigest: string | undefined = 'a1b2c3d4e5f60718293a4b5c6d7e8f90') =>
      act({ type: 'photoCapture', photoRequestId: state.photo!.id, outcome, ...(imageDigest ? { imageDigest } : {}) }, status),
  };
}
export type Campaign = Awaited<ReturnType<typeof campaign>>;

/** Small talk with an NPC (counts toward the goal warm-up and the patience limit). */
export async function chat(game: Campaign, npcId: NpcId, turns: number) {
  for (let i = 0; i < turns; i++) await game.talk('今天天气很好。', npcId);
}
/** Q1 at 老王: coffee is sold out (dialogue only); after the warm-up, naming tea enables the Pay action, and paying completes the quest. */
export async function q1(game: Campaign) {
  const coffee = await game.talk('我要咖啡。');
  expect(coffee.body.npcReply).toBe('咖啡卖完了。我们有茶和水。');
  expect(coffee.body.actions).toEqual([]);
  await chat(game, 'vendor', GOAL_WARMUP_EXCHANGES - 2);
  const tea = await game.talk('那就茶吧。');
  expect(tea.body.actions).toEqual([{ kind: 'pay', anchorId: ANCHORS.vendor.id, drink: 'tea', priceCny: 10 }]);
  expect(game.state.npcActions).toEqual([{ anchorId: ANCHORS.vendor.id, action: tea.body.actions[0] }]);
  await game.pay(tea.body.actions[0].anchorId);
  expect(game.state).toMatchObject({ missionId: 'Q1', status: 'cleared', inventory: { cny: 10, drinks: ['tea'] } });
  expect(game.state.purchases).toHaveLength(1);
}
/** Q2 at the street guide: the reply is the verified route, never model text. */
export async function q2(game: Campaign) {
  await game.act({ type: 'startMission', missionId: 'Q2' });
  await game.walkTo(ANCHORS.guide.position);
  // A request during the warm-up gets an in-character deferral; asking again once warmed up gets the route.
  const opening = await game.talk('请问，去上海大酒店怎么走？', 'guide');
  expect(opening.body.npcReply).toBe(pacingReplies.guide[0]);
  expect(game.state.directions).toBeNull();
  await chat(game, 'guide', GOAL_WARMUP_EXCHANGES - 2);
  const turn = await game.talk('请问，去上海大酒店怎么走？', 'guide');
  expect(turn.body.npcReply).toBe(ROUTE.textZh);
  expect(turn.body.actions).toEqual([{ kind: 'show-directions' }, { kind: 'end-conversation' }]);
  expect(game.state.directions).toMatchObject({ routeId: ROUTE.routeId, hotelAnchorId: 'hotel.grand' });
  expect(game.state.status).toBe('cleared');
}
/** Q3 by the river: request → stand on the spot → NPC countdown → capture acknowledgment. */
export async function q3(game: Campaign) {
  await game.act({ type: 'startMission', missionId: 'Q3' });
  await game.walkTo(ANCHORS.passerby.position);
  await game.talk('你好！', 'passerby');
  await chat(game, 'passerby', GOAL_WARMUP_EXCHANGES - 2);
  const ask = await game.talk('可以帮我在这里拍张照吗？', 'passerby');
  expect(game.state.photo).toMatchObject({ status: 'accepted', passerbyAnchorId: ANCHORS.passerby.id, viewpointAnchorId: ANCHORS.viewpoint.id });
  expect(ask.body.actions).toEqual([{ kind: 'go-to-photo-spot', spot: game.state.photo!.spot }]);
  await game.walkTo(game.state.photo!.spot);
  await game.startPhoto();
  expect(game.state.photo?.status).toBe('countdown');
  advance(3_100);
  await game.capture('captured');
  expect(game.state).toMatchObject({ missionId: 'Q3', status: 'cleared' });
  expect(game.state.badges).toContain('shanghai-explorer');
}
