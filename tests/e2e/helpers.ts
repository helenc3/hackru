import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { chunkOf, planChunk, seedFromWorldId, type ChunkManifest, type GameAction, type Position, type PublicState } from '@vibequest/shared';

export const HARNESS = process.env.E2E_HARNESS_URL ?? 'http://127.0.0.1:4175';
export const SESSION_KEY = 'vibequest.player-session.v1';

/** Hold one movement key until the avatar passes `destination` on `axis`; the camera starts at yaw 0 (W = −z, D = +x). */
async function walkAxis(page: Page, axis: 'x' | 'z', destination: number) {
  const world = page.getByTestId('world-renderer');
  await world.focus();
  const start = Number(await world.getAttribute(`data-position-${axis}`));
  if (Math.abs(destination - start) < 0.05) return;
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
      if (position * options.direction >= options.destination * options.direction) { release(); resolve(); }
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
  for (const point of waypoints) { await walkAxis(page, 'x', point.x); await walkAxis(page, 'z', point.z); }
}

export async function interact(page: Page, targetId: string) {
  const button = page.locator(`[data-target-id="${targetId}"]`);
  await expect(button).toBeEnabled({ timeout: 15000 });
  await button.click();
}

export async function say(page: Page, text: string) {
  const panel = page.getByTestId('dialogue-panel');
  const typed = panel.getByRole('button', { name: 'Use typed Mandarin', exact: true });
  if (await typed.count()) await typed.click();
  const before = await panel.getByTestId('npc-reply').count() ? await panel.getByTestId('npc-reply').innerText() : '';
  await panel.getByRole('textbox').fill(text);
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  // A quest-completing turn ends the attempt, which closes the conversation; the caller reads the result.
  await expect.poll(async () => !await panel.count() || await panel.getByRole('textbox').inputValue() === '').toBe(true);
  if (!await panel.count()) return null;
  await expect.poll(async () => await panel.getByTestId('npc-reply').count() ? panel.getByTestId('npc-reply').innerText() : '').not.toBe(before);
  return panel.getByTestId('npc-reply').innerText();
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
  // A new attempt remounts the world, which restores from IndexedDB before streaming again.
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
  return { get state() { return state; }, raw, send, act, talk, goto, anchor };
}
