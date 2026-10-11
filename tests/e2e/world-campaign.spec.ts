import { expect, test, type Page } from '@playwright/test';
import { planChunk, seedFromWorldId, type ChunkManifest, type PublicState } from '@vibequest/shared';
import { harness, hashes, interact, playerState, riversidePlan, say, spawnCoordsIn, startWorld, walkRoute, worldReady } from './helpers';

/** Planner-reserved guide in chunk (1,0): the Q2 helper on the row-0 avenue's north sidewalk. */
function guidePlan(worldId: string) {
  const near = planChunk(seedFromWorldId(worldId), { cx: 1, cz: 0 }).requiredAnchors.find((anchor) => anchor.capability === 'direction-helper')!.near!;
  return { x: 40 + near.x, z: near.z };
}
const target = (state: PublicState, predicate: (entry: PublicState['interactables'][number]) => boolean) => {
  const found = state.interactables.find(predicate);
  expect(found, `interactables: ${state.interactables.map((entry) => entry.id).join(', ')}`).toBeTruthy();
  return found!;
};
const nextQuest = async (page: Page, missionId: string) => {
  await page.getByTestId('result-panel').getByRole('button', { name: 'Next quest' }).click();
  await expect(page.getByText(`${missionId} · Tier`)).toBeVisible();
  await page.waitForTimeout(500); // let the remounted world leave its first frame
  await worldReady(page);
};

test('player world: buy a drink, get verified hotel directions, and a river photo — the world survives a reload', async ({ page, request }) => {
  test.setTimeout(300_000);
  const committed: ChunkManifest[] = [];
  page.on('response', async (response) => {
    if (/\/chunks(\/restore)?$/.test(new URL(response.url()).pathname) && response.ok()) committed.push(...(await response.json()).chunks);
  });
  await startWorld(page);
  await expect(page.locator('[data-testid="validation-harness"]')).toHaveCount(0);
  const worldId = (await page.getByTestId('world-renderer').getAttribute('data-world-id'))!;
  let state = await playerState(page, request);
  expect(state).toMatchObject({ missionId: 'Q1', worldId, inventory: { cny: 20 } });
  const spawn = state.position; // the corner sidewalk of the row-0 avenue; north of it is open road

  // Q1 — 老王 stands 5 m east of spawn. Coffee is sold out; asking for tea prices it and enables the Pay button; paying completes the quest.
  const vendor = target(state, (entry) => entry.role === 'vendor' && entry.label === '老王');
  await walkRoute(page, [{ x: vendor.position.x - 1.2, z: state.position.z }]);
  await interact(page, vendor.id);
  await expect(page.getByTestId('dialogue-panel')).toContainText('你想喝什么');
  expect(await say(page, '我要咖啡。')).toContain('咖啡卖完了');
  await expect(page.getByTestId('pay-button')).toHaveCount(0);
  expect(await say(page, '那就茶吧。')).toContain('十元');
  await expect(page.getByTestId('pay-button')).toContainText('Pay ¥10');
  await page.getByTestId('pay-button').click();
  await expect(page.getByTestId('result-panel')).toBeVisible();
  state = await playerState(page, request);
  expect(state).toMatchObject({ status: 'cleared', completedMissionIds: ['Q1'], inventory: { cny: 10, drinks: ['tea'] } });
  expect(state.purchases).toHaveLength(1);

  // Reload mid-journey: same world, spawn restored from IndexedDB without generation, progress intact.
  const spawnBefore = hashes(committed.filter((chunk) => Math.abs(chunk.coord.cx) <= 1 && Math.abs(chunk.coord.cz) <= 1));
  expect(Object.keys(spawnBefore)).toHaveLength(9);
  const chunkRequests: (string | null)[] = [];
  page.on('request', (outgoing) => { if (new URL(outgoing.url()).pathname.endsWith('/chunks')) chunkRequests.push(outgoing.postData()); });
  committed.length = 0;
  await page.reload();
  await page.getByRole('button', { name: 'Continue Session' }).click();
  await worldReady(page);
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-world-id', worldId);
  expect(chunkRequests.flatMap(spawnCoordsIn)).toEqual([]);
  expect(hashes(committed.filter((chunk) => Math.abs(chunk.coord.cx) <= 1 && Math.abs(chunk.coord.cz) <= 1))).toEqual(spawnBefore);
  expect((await playerState(page, request)).completedMissionIds).toEqual(['Q1']);

  // Q2 — the guide on the avenue east of spawn gives directions from the committed street graph.
  await nextQuest(page, 'Q2');
  const guide = guidePlan(worldId);
  const avenueZ = riversidePlan(worldId).avenueZ ?? guide.z + 5.8;
  await walkRoute(page, [spawn, { x: spawn.x, z: avenueZ }, { x: guide.x, z: avenueZ }, { x: guide.x, z: guide.z + 1.4 }]);
  state = await playerState(page, request);
  const helper = target(state, (entry) => entry.role === 'guide');
  await interact(page, helper.id);
  await say(page, '请问，去上海大酒店怎么走？'); // completes Q2, which closes the conversation
  state = await playerState(page, request);
  expect(state.directions?.textZh).toContain('上海大酒店');
  await expect(page.getByTestId('directions-card')).toContainText('上海大酒店');
  expect(state).toMatchObject({ status: 'cleared', completedMissionIds: ['Q1', 'Q2'] });

  // Q3 — east along the avenue to the Huangpu promenade, ask a passer-by, stand on the spot, countdown, capture.
  await nextQuest(page, 'Q3');
  const river = riversidePlan(worldId);
  const promenadeX = river.riverWestX - 3;
  await walkRoute(page, [{ x: guide.x, z: avenueZ }, { x: promenadeX, z: avenueZ }, { x: promenadeX, z: river.passerby.z }]);
  state = await playerState(page, request);
  const passerby = target(state, (entry) => entry.role === 'passerby');
  await walkRoute(page, [{ x: passerby.position.x - 1.2, z: passerby.position.z }]);
  await interact(page, passerby.id);
  await say(page, '可以帮我在这里拍张照吗？');
  state = await playerState(page, request);
  expect(state.photo).toMatchObject({ status: 'accepted' });
  const spot = state.photo!.spot;
  // The passer-by's reply enables "Go to photo spot", which walks the player there.
  await page.getByTestId('go-to-photo-spot').click();
  const world = page.getByTestId('world-renderer');
  await expect.poll(async () => Math.hypot(Number(await world.getAttribute('data-position-x')) - spot.x, Number(await world.getAttribute('data-position-z')) - spot.z), { timeout: 30_000 }).toBeLessThan(1);
  const overlay = page.getByTestId('photo-overlay');
  await overlay.getByRole('button', { name: 'Ready · start photo' }).click();
  await expect(page.getByTestId('photo-result')).toBeVisible({ timeout: 20000 });
  state = await playerState(page, request);
  expect(state).toMatchObject({ status: 'cleared', completedMissionIds: ['Q1', 'Q2', 'Q3'], badges: ['shanghai-explorer'], photo: { status: 'captured' } });

  // Revisit after unloading: the spawn meshes unloaded three chunks back; a reload restores the identical spawn terrain.
  chunkRequests.length = 0; committed.length = 0;
  await page.reload();
  await page.getByRole('button', { name: 'Continue Session' }).click();
  await worldReady(page);
  await expect.poll(() => committed.filter((chunk) => Math.abs(chunk.coord.cx) <= 1 && Math.abs(chunk.coord.cz) <= 1).length).toBe(9);
  expect(hashes(committed.filter((chunk) => Math.abs(chunk.coord.cx) <= 1 && Math.abs(chunk.coord.cz) <= 1))).toEqual(spawnBefore);
  expect(chunkRequests.flatMap(spawnCoordsIn)).toEqual([]);
  expect((await playerState(page, request)).completedMissionIds).toEqual(['Q1', 'Q2', 'Q3']);
});

test('developer harness: the same three quests through the validation API, rewards granted once', async ({ request }) => {
  const h = await harness(request);
  const worldId = h.state.worldId;
  await h.goto(h.state.position);
  const vendor = h.anchor((entry) => entry.role === 'vendor' && entry.label === '老王');
  await h.goto(vendor.position); // an anchor stand point is validated as reachable
  await h.talk(vendor.id, 'vendor', '我要咖啡。');
  const priced = await h.talk(vendor.id, 'vendor', '那就茶吧。');
  expect(priced.actions).toEqual([{ kind: 'pay', anchorId: vendor.id, drink: 'tea', priceCny: 10 }]);
  await h.act({ type: 'choose', choiceId: 'q1.pay', anchorId: vendor.id });
  expect(h.state).toMatchObject({ status: 'cleared', inventory: { cny: 10 } });
  await h.act({ type: 'choose', choiceId: 'q1.pay', anchorId: vendor.id }, 422); // the attempt has ended: no second reward
  const q1Xp = h.state.xp;

  await h.act({ type: 'startMission', missionId: 'Q2' });
  const guide = guidePlan(worldId);
  await h.goto({ x: guide.x, z: guide.z });
  const helper = h.anchor((entry) => entry.role === 'guide');
  await h.goto(helper.position);
  await h.talk(helper.id, 'guide', '去火车站怎么走？');
  expect(h.state.directions).toBeNull(); // unknown destination: no invented route
  const turn = await h.talk(helper.id, 'guide', '请问，去上海大酒店怎么走？');
  expect(turn.npcReply).toBe(h.state.directions?.textZh);
  expect(h.state.status).toBe('cleared');

  await h.act({ type: 'startMission', missionId: 'Q3' });
  const river = riversidePlan(worldId);
  await h.goto({ x: river.passerby.x, z: river.passerby.z });
  const passerby = h.anchor((entry) => entry.role === 'passerby');
  await h.goto(passerby.position);
  await h.talk(passerby.id, 'passerby', '可以帮我在这里拍张照吗？');
  const photo = h.state.photo!;
  expect(photo.status).toBe('accepted');
  await h.goto(photo.spot);
  await h.act({ type: 'choose', choiceId: 'q3.start-photo', anchorId: photo.viewpointAnchorId });
  await h.act({ type: 'photoCapture', photoRequestId: photo.id, outcome: 'captured', imageDigest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' }, 422); // countdown still running
  await new Promise((resolve) => setTimeout(resolve, 3_100));
  await h.act({ type: 'photoCapture', photoRequestId: photo.id, outcome: 'failed' });
  expect(h.state.photo).toMatchObject({ status: 'accepted', attempts: 1 });
  await h.act({ type: 'choose', choiceId: 'q3.start-photo', anchorId: photo.viewpointAnchorId });
  await new Promise((resolve) => setTimeout(resolve, 3_100));
  await h.act({ type: 'photoCapture', photoRequestId: photo.id, outcome: 'captured', imageDigest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' });
  expect(h.state).toMatchObject({ status: 'cleared', completedMissionIds: ['Q1', 'Q2', 'Q3'], badges: ['shanghai-explorer'] });
  expect(h.state.xp).toBeGreaterThan(q1Xp);
});

test('production refuses the harness and validation sessions', async ({ page, request }) => {
  expect((await request.post('/api/sessions', { data: { initialTier: 0, providerMode: 'fixture', validationMode: true } })).status()).toBe(422);
  await page.goto('/__validation');
  await expect(page.getByText('The validation harness is unavailable.')).toBeVisible();
});

test('production serves UI, API and the city routes from one origin', async ({ request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health).toMatchObject({ status: 'ok', features: { validationHarness: false, fixtures: true, cityProvider: 'fallback' } });
  expect((await request.get('/')).headers()['content-type']).toContain('text/html');
  expect((await request.get('/api/nope')).status()).toBe(404);
  expect((await request.get('/audio/missing.mp3')).status()).toBe(404);
  const session: PublicState = (await (await request.post('/api/sessions', { data: { initialTier: 0, providerMode: 'fixture' } })).json()).state;
  const world = await (await request.get(`/api/worlds/${session.worldId}`)).json();
  expect(world).toMatchObject({ worldId: session.worldId, hotelAnchorId: 'hotel.grand' });
  const chunks = await (await request.post(`/api/sessions/${session.sessionId}/chunks`, { data: { coords: [{ cx: 0, cz: 0 }] } })).json();
  expect(chunks.chunks[0]).toMatchObject({ worldId: session.worldId, coord: { cx: 0, cz: 0 } });
  expect(chunks.chunks[0].placements.every((placement: { assetId: string }) => /^(bld|sf|st|ls|wf|an)\./.test(placement.assetId))).toBe(true);
});
