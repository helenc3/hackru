import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { walkingPath } from '../../apps/web/src/world/navigation';
import { GENERATION_RULES, GOAL_WARMUP_EXCHANGES, chunkOf, chunkKey, createWorldView, planChunk, seedFromWorldId, type ChunkManifest, type GameAction, type Position, type PublicState } from '@vibequest/shared';

export const HARNESS = process.env.E2E_HARNESS_URL ?? 'http://127.0.0.1:4175';
export const SESSION_KEY = 'vibequest.player-session.v1';

/**
 * Walk to the active quest's target the way a player would: the compass's "Walk there" follows the
 * street network one obstacle-aware leg at a time, so routes do not depend on the world's seed.
 */
export async function walkToQuestTarget(page: Page) {
  const compass = page.getByTestId('quest-compass');
  await expect(compass).toBeVisible({ timeout: 15000 });
  await page.getByTestId('walk-there').click();
  await expect.poll(async () => Number(await compass.getAttribute('data-distance')), { timeout: 150_000, intervals: [500] }).toBeLessThanOrEqual(1);
}

/** Hold one movement key until the avatar passes `destination` on `axis`; the camera starts at yaw 0 (W = −z, D = +x). */
async function walkAxis(page: Page, axis: 'x' | 'z', destination: number) {
  const world = page.getByTestId('world-renderer');
  await world.focus();
  const start = Number(await world.getAttribute(`data-position-${axis}`));
  if (Math.abs(destination - start) < 0.2) return;
  const direction = Math.sign(destination - start);
  const key = axis === 'x' ? (direction > 0 ? 'd' : 'a') : (direction > 0 ? 's' : 'w');
  const code = `Key${key.toUpperCase()}`;
  // Release inside the animation loop so protocol latency cannot overshoot; a stall fails fast.
  const stopped = world.evaluate((root, options) => new Promise<void>((resolve, reject) => {
    const read = () => Number(root.getAttribute(`data-position-${options.axis}`));
    const deadline = performance.now() + Math.abs(options.destination - read()) / 3 * 1000 + 20000;
    let last = read(), lastMoved = performance.now();
    const release = () => root.dispatchEvent(new KeyboardEvent('keyup', { code: options.code, bubbles: true }));
    const watch = () => {
      const position = read();
      if (Math.abs(position - last) > 0.05) { last = position; lastMoved = performance.now(); }
      if (position * options.direction >= options.destination * options.direction - 0.2) { release(); resolve(); }
      else if (performance.now() >= deadline || performance.now() - lastMoved > 8000) { release(); reject(new Error(`Walking ${options.code} toward ${options.axis}=${options.destination} stopped at ${position}`)); }
      else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), { code, axis, destination, direction });
  await page.keyboard.down(key);
  try { await stopped; } finally { await page.keyboard.up(key); }
}

/** Walk an axis-aligned route; each waypoint changes x then z. */
export async function walkRoute(page: Page, waypoints: Position[]) {
  const world = page.getByTestId('world-renderer');
  const id = await sessionId(page);
  const state = await serverState(page.request, id!);
  const destinations: Position[] = [];
  let previous = { x: Number(await world.getAttribute('data-position-x')), z: Number(await world.getAttribute('data-position-z')) };
  for (const point of waypoints) {
    const segments = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / 40));
    for (let i = 1; i <= segments; i++) destinations.push({ x: previous.x + (point.x - previous.x) * i / segments, z: previous.z + (point.z - previous.z) * i / segments });
    previous = point;
  }
  for (const point of destinations) {
    const start = { x: Number(await world.getAttribute('data-position-x')), z: Number(await world.getAttribute('data-position-z')) };
    const from = chunkOf(start), to = chunkOf(point);
    const coords = [];
    for (let cz = Math.min(from.cz, to.cz) - 1; cz <= Math.max(from.cz, to.cz) + 1; cz++)
      for (let cx = Math.min(from.cx, to.cx) - 1; cx <= Math.max(from.cx, to.cx) + 1; cx++) coords.push({ cx, cz });
    const chunks: ChunkManifest[] = [];
    for (let i = 0; i < coords.length; i += GENERATION_RULES.batchSize) {
      const response = await page.request.post(`/api/sessions/${id}/chunks`, { data: { coords: coords.slice(i, i + GENERATION_RULES.batchSize), urgent: true } });
      expect(response.status()).toBe(200);
      chunks.push(...(await response.json()).chunks);
    }
    const view = createWorldView(state.worldId, seedFromWorldId(state.worldId), new Map(chunks.map((chunk) => [chunkKey(chunk.coord), chunk])));
    const path = walkingPath(view, start, point, 40_000);
    expect(path.length, `No walking route from ${JSON.stringify(start)} to ${JSON.stringify(point)}`).toBeGreaterThan(0);
    // Compress collinear grid steps while preserving turns around solid props.
    const turns = path.filter((here, i) => {
      const before = i ? path[i - 1]! : start, after = path[i + 1];
      return !after || Math.abs((here.x - before.x) * (after.z - here.z) - (here.z - before.z) * (after.x - here.x)) > 0.001;
    });
    for (const step of turns) { await walkAxis(page, 'x', step.x); await walkAxis(page, 'z', step.z); }
  }
}

export async function interact(page: Page, targetId: string) {
  const world = page.getByTestId('world-renderer');
  const id = await sessionId(page);
  const state: PublicState = (await (await page.request.get(`/api/sessions/${id}`)).json()).state;
  const target = state.interactables.find((entry) => entry.id === targetId);
  expect(target, `Missing target ${targetId}`).toBeTruthy();
  if (target!.kind === 'npc') {
    await expect(page.getByLabel('Press E to talk')).toBeVisible();
    await world.focus();
    await page.keyboard.press('e');
    await expect(page.getByTestId('dialogue-panel')).toBeVisible();
    await expect(page.getByTestId('dialogue-panel')).toContainText(target!.label);
    return;
  }
  const button = page.locator(`[data-target-id="${targetId}"]`);
  await expect(button).toBeEnabled({ timeout: 15000 });
  await button.click();
}

export async function say(page: Page, text: string) {
  const panel = page.getByTestId('dialogue-panel');
  const typed = panel.getByRole('button', { name: 'Use typed Mandarin', exact: true });
  if (await typed.count()) await typed.click();
  // Count replies, not text: an NPC may legitimately say the same line twice.
  const replies = panel.locator('.bubble.npc:not(.partial)');
  const before = await replies.count();
  await panel.getByRole('textbox').fill(text);
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  // A quest-completing turn ends the attempt, which closes the conversation; the caller reads the result.
  // Once a goal button is up the text box is gone (only the button finishes the task).
  const box = panel.getByRole('textbox');
  await expect.poll(async () => !await panel.count() || !await box.count() || await box.inputValue() === '').toBe(true);
  if (!await panel.count()) return null;
  await expect.poll(() => replies.count()).toBeGreaterThan(before);
  return panel.getByTestId('npc-reply').innerText();
}

/** Small-talk turns through the NPC's warm-up: `turns` defaults to filling the exchanges before the goal request. */
export const SMALL_TALK = ['今天天气很好。', '我是美国人。', '我第一次来上海。'];
export async function chat(page: Page, turns = GOAL_WARMUP_EXCHANGES - 2) {
  for (let i = 0; i < turns; i++) await say(page, SMALL_TALK[i % SMALL_TALK.length]!);
}

export const closeConversation = (page: Page) => page.getByTestId('dialogue-panel').getByRole('button', { name: 'Close conversation' }).click();

export async function startWorld(page: Page, provider: 'live' | 'fixture' = 'fixture', base = '') {
  await page.goto(`${base}/`);
  await page.getByLabel('Conversation provider').selectOption(provider);
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await worldReady(page);
}

/** The spawn box is committed (movement unlocks once the player's chunk is). */
export async function worldReady(page: Page) {
  const world = page.getByTestId('world-renderer');
  // A new attempt remounts the world, which streams the server-owned chunks again.
  await expect(world).toHaveAttribute('data-city-status', 'streaming', { timeout: 60000 });
  await expect.poll(async () => Number(await world.getAttribute('data-chunks')), { timeout: 60000 }).toBeGreaterThanOrEqual(9);
  await expect(page.getByTestId('city-loading')).toHaveCount(0, { timeout: 30000 });
}

export const sessionId = (page: Page) => page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
export const serverState = async (request: APIRequestContext, id: string, base = ''): Promise<PublicState> => (await (await request.get(`${base}/api/sessions/${id}`)).json()).state;
export const playerState = async (page: Page, request: APIRequestContext) => serverState(request, (await sessionId(page))!);

/** Planner-guaranteed riverside photo opportunity in row 0 (west bank of the Huangpu), from the world's own seed. */
export function riversidePlan(worldId: string) {
  const seed = seedFromWorldId(worldId);
  for (let cx = 0; cx < 8; cx++) {
    const plan = planChunk(seed, { cx, cz: 0 });
    const viewpoint = plan.requiredAnchors.find((anchor) => anchor.capability === 'river-viewpoint');
    const passerby = plan.requiredAnchors.find((anchor) => anchor.capability === 'photo-passerby');
    const avenue = plan.roads.find((road) => road.from.z === road.to.z);
    if (viewpoint?.near && passerby?.near) return { viewpoint: { x: cx * 40 + viewpoint.near.x, z: viewpoint.near.z }, passerby: { x: cx * 40 + passerby.near.x, z: passerby.near.z }, avenueZ: avenue?.from.z, riverWestX: Math.min(...plan.water.map((water) => cx * 40 + water.rect.minX)) };
  }
  throw new Error('No riverside viewpoint planned in row 0.');
}

/** Spawn-box chunk keys (|cx|,|cz| ≤ 1) named in a chunk request body. */
export const spawnCoordsIn = (body: string | null) => (body ? (JSON.parse(body).coords ?? []) as { cx: number; cz: number }[] : []).filter(({ cx, cz }) => Math.abs(cx) <= 1 && Math.abs(cz) <= 1);
export const hashes = (chunks: ChunkManifest[]) => Object.fromEntries(chunks.map((chunk) => [`${chunk.coord.cx},${chunk.coord.cz}`, chunk.contentHash]));

/** Developer harness client: validation sessions skip the walking speed rule but still need committed, walkable positions. */
export async function harness(request: APIRequestContext) {
  let state: PublicState = (await (await request.post(`${HARNESS}/api/sessions`, { data: { initialTier: 0, providerMode: 'fixture', validationMode: true, inputPreference: 'typed-accessibility' } })).json()).state;
  let n = 0;
  const raw = (path: string, data: object) => request.post(`${HARNESS}/api/sessions/${state.sessionId}/${path}`, { data });
  const send = async (path: string, data: object, status = 200) => {
    const response = await raw(path, { ...data, expectedVersion: state.version });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(status);
    const body = await response.json();
    if (body.state) state = body.state;
    return body;
  };
  const act = (action: GameAction, status = 200, actionId = `h-${++n}`) => send('actions', { actionId, action }, status);
  const talk = (anchorId: string, npcId: 'vendor' | 'guide' | 'passerby', text: string, turnId = `t-${++n}`) => send('turns', { turnId, npcId, anchorId, input: { text, source: 'typed' } });
  /** Small talk through the NPC's goal warm-up (defaults to the exchanges before a goal request on exchange GOAL_WARMUP_EXCHANGES). */
  const chat = async (anchorId: string, npcId: 'vendor' | 'guide' | 'passerby', turns = GOAL_WARMUP_EXCHANGES - 2) => {
    for (let i = 0; i < turns; i++) await talk(anchorId, npcId, SMALL_TALK[i % SMALL_TALK.length]!);
  };
  /** Commit the chunks around a position, then step there (validation mode: no speed rule). */
  const goto = async (position: Position) => {
    const { cx, cz } = chunkOf(position);
    const coords = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz]) => ({ cx: cx + dx!, cz: cz + dz! }));
    const chunks = await request.post(`${HARNESS}/api/sessions/${state.sessionId}/chunks`, { data: { coords, urgent: true } });
    expect(chunks.status()).toBe(200);
    // Planned points can sit inside a seeded prop; step to the nearest walkable point within 3 m.
    for (const radius of [0, 0.75, 1.5, 2.25, 3]) {
      for (const angle of radius ? [0, 1, 2, 3, 4, 5, 6, 7] : [0]) {
        const candidate = { x: position.x + radius * Math.cos(angle * Math.PI / 4), z: position.z + radius * Math.sin(angle * Math.PI / 4) };
        const response = await raw('actions', { actionId: `h-${++n}`, expectedVersion: state.version, action: { type: 'move', position: candidate } });
        if (response.status() === 200) { state = (await response.json()).state; return; }
      }
    }
    throw new Error(`No walkable point within 3 m of ${JSON.stringify(position)}`);
  };
  const anchor = (predicate: (target: PublicState['interactables'][number]) => boolean) => {
    const found = state.interactables.find(predicate);
    if (!found) throw new Error(`No matching interactable among ${state.interactables.map((target) => target.id).join(', ')}`);
    return found;
  };
  return { get state() { return state; }, raw, send, act, talk, chat, goto, anchor };
}
