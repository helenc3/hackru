import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { GameAction, PublicState } from '@vibequest/shared';

// Real-server recovery journeys (spec §11, §13 "Outage/recovery" and "State integrity").
// The configured servers carry no provider keys, so live Gemini/ElevenLabs calls fail as
// recoverable 503s. The restart test spawns its own production server it can kill.
const HARNESS = process.env.E2E_HARNESS_URL ?? 'http://127.0.0.1:4175';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RESTART_PORT = Number(process.env.E2E_RESTART_PORT ?? 4480);
const SESSION_KEY = 'vibequest.player-session.v1';

async function walk(page: Page, key: string, axis: 'x' | 'z', destination: number, direction: number) {
  const world = page.getByTestId('world-renderer');
  await world.focus();
  const code = `Key${key.toUpperCase()}`;
  const stopped = world.evaluate((root, options) => new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + 15000;
    const release = () => root.dispatchEvent(new KeyboardEvent('keyup', { code: options.code, bubbles: true }));
    const watch = () => {
      const position = Number(root.getAttribute(`data-position-${options.axis}`));
      if (position * options.direction >= options.destination * options.direction) { release(); resolve(); }
      else if (performance.now() >= deadline) { release(); reject(new Error(`Walking ${options.code} stopped at ${position}`)); }
      else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), { code, axis, destination, direction });
  await page.keyboard.down(key);
  try { await stopped; } finally { await page.keyboard.up(key); }
}

async function interact(page: Page, targetId: string) {
  const button = page.locator(`[data-target-id="${targetId}"]`);
  await expect(button).toBeEnabled();
  await button.click();
}

async function start(page: Page, provider: 'live' | 'fixture', base = '') {
  await page.goto(`${base}/`);
  await page.getByRole('combobox', { name: 'Conversation provider' }).click();
  await page.getByRole('option', { name: provider === 'live' ? 'Live AI' : 'Fixture demonstration · scripted', exact: true }).click();
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-position-z', /./);
}

/** Sign → plaza door → café counter, as in the café journey. */
async function reachXiaolin(page: Page) {
  await walk(page, 'w', 'z', 6.1, -1);
  await walk(page, 'a', 'x', -9.8, -1);
  await interact(page, 'p1.entrance-sign');
  await page.keyboard.press('Escape');
  await interact(page, 'p1.enter-plaza-door');
  await walk(page, 'w', 'z', 4.1, -1);
  await interact(page, 'xiaolin');
  const panel = page.getByTestId('dialogue-panel');
  const typed = panel.getByRole('button', { name: 'Use typed Mandarin', exact: true });
  if (await typed.count()) await typed.click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  return panel;
}

const sessionId = (page: Page) => page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
const serverState = async (request: APIRequestContext, id: string, base = ''): Promise<PublicState> => (await (await request.get(`${base}/api/sessions/${id}`)).json()).state;
const progress = (state: PublicState) => ({ missionId: state.missionId, status: state.status, objectives: state.objectives, inventory: state.inventory, xp: state.xp, badges: state.badges, timer: state.timer && state.timer.remainingMs });

test('live AI outage shows a retryable recovery, keeps the draft, and changes no progress', async ({ page, request }) => {
  await start(page, 'live');
  const panel = await reachXiaolin(page);
  const id = (await sessionId(page))!;
  const before = await serverState(request, id);
  expect(before.providerStatus).toBe('live');

  await panel.getByRole('textbox').fill('我要咖啡。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  const recovery = page.getByTestId('recovery-panel');
  await expect(recovery).toContainText('PROVIDER_UNAVAILABLE');
  await expect(recovery.getByRole('button', { name: 'Retry request' })).toBeVisible();
  await expect(panel.getByRole('textbox')).toHaveValue('我要咖啡。');
  await expect(panel.getByTestId('npc-reply')).toHaveCount(0);

  // Retrying against the same outage fails the same way and still preserves everything.
  await recovery.getByRole('button', { name: 'Retry request' }).click();
  await expect(recovery).toContainText('PROVIDER_UNAVAILABLE');
  await expect(panel.getByRole('textbox')).toHaveValue('我要咖啡。');
  await expect(panel.getByRole('textbox')).toBeEnabled();

  const after = await serverState(request, id);
  expect(after.status).toBe('active');
  expect(progress(after)).toEqual(progress(before)); // P1 is untimed: timer stays null; no objective/xp change.
  expect(after.version).toBeGreaterThan(before.version); // Only the provider bookkeeping advanced.
  await expect(page.locator('.session-footer')).toContainText(`Version ${after.version}`);
});

test('fixture reply audio failure degrades to the Mandarin subtitle without blocking progress', async ({ page, request }) => {
  await start(page, 'fixture');
  const panel = await reachXiaolin(page);
  const id = (await sessionId(page))!;
  const audio = page.getByTestId('audio-controller');
  for (const [index, line] of ['我要咖啡。', '那就茶吧。', '茶十元。'].entries()) {
    await panel.getByRole('textbox').fill(line);
    await panel.getByRole('button', { name: 'Send Mandarin' }).click();
    await expect(panel.getByRole('textbox')).toHaveValue('');
    await expect(panel.getByTestId('npc-reply')).toContainText(/\p{Script=Han}/u);
    // No ElevenLabs key: the speech job fails and the subtitle stays the channel.
    if (index === 0) {
      await expect(audio.getByRole('status')).toHaveText('Reply audio is unavailable. Retry or read the reply.', { timeout: 15000 });
      await expect(audio.getByRole('button', { name: 'Retry audio' })).toBeVisible();
      await expect(page.getByTestId('recovery-panel')).toHaveCount(0);
    }
  }
  await panel.getByRole('button', { name: 'Close conversation' }).click();
  await interact(page, 'p1.pay-cafe'); // Payment is only offered once the order succeeded.
  await expect.poll(async () => (await serverState(request, id)).objectives.filter((objective) => objective.complete).length).toBeGreaterThan(0);
});

test('server restart expires the stored session and a fresh start works', async ({ page }) => {
  const base = `http://127.0.0.1:${RESTART_PORT}`;
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', PORT: String(RESTART_PORT), ENABLE_DEMO_FIXTURES: 'true', ENABLE_VALIDATION_HARNESS: 'false' };
  for (const key of Object.keys(env)) if (/GEMINI|ELEVENLABS/.test(key)) delete env[key];
  let server: ChildProcess | undefined;
  const boot = async () => {
    server = spawn('node', ['apps/server/dist/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
    await expect.poll(async () => { try { return (await fetch(`${base}/api/health`)).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
  };
  const halt = async () => {
    if (!server || server.exitCode !== null) return;
    const exited = new Promise((resolve) => server!.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  };
  try {
    await boot();
    await start(page, 'fixture', base);
    const old = await sessionId(page);
    expect(old).toBeTruthy();

    await halt();
    await boot();
    await page.reload();
    await page.getByRole('button', { name: 'Continue Session' }).click();
    const recovery = page.getByTestId('recovery-panel');
    await expect(recovery).toContainText('This session has expired.');
    await expect(recovery).toContainText('SESSION_NOT_FOUND');
    await recovery.getByRole('button', { name: 'Start a fresh session' }).click();
    await expect(page.getByRole('button', { name: 'Continue Session' })).toHaveCount(0);

    await page.getByRole('combobox', { name: 'Conversation provider' }).click();
  await page.getByRole('option', { name: 'Fixture demonstration · scripted', exact: true }).click();
    await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
    await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-position-z', /./);
    const fresh = await sessionId(page);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(old);
    expect((await fetch(`${base}/api/sessions/${fresh}`)).status).toBe(200);
  } finally { await halt(); }
});

test('replayed action and turn IDs are idempotent, reused IDs conflict, and one reward is granted', async ({ request }) => {
  let state: PublicState = (await (await request.post(`${HARNESS}/api/sessions`, { data: { initialTier: 0, providerMode: 'fixture', validationMode: true, inputPreference: 'typed-accessibility' } })).json()).state;
  let n = 0;
  const raw = (path: string, data: object) => request.post(`${HARNESS}/api/sessions/${state.sessionId}/${path}`, { data });
  const send = async (path: string, data: object) => {
    const response = await raw(path, { ...data, expectedVersion: state.version });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(200);
    const body = await response.json();
    state = body.state;
    return body;
  };
  const act = (action: GameAction, actionId = `a-${++n}`) => send('actions', { actionId, action });
  await act({ type: 'moveZone', zoneId: 'cafe' });
  await act({ type: 'inspect', targetId: 'p1.entrance-sign' });
  await act({ type: 'choose', choiceId: 'p1.enter-plaza-door' });

  // Turn replay: the identical response, no second evaluation.
  const turn = { turnId: 't-1', npcId: 'xiaolin', input: { text: '我要咖啡。', source: 'typed' } };
  const first = await send('turns', turn);
  const replay = await raw('turns', { ...turn, expectedVersion: 0 }); // a late duplicate with an old version
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual(first);
  const conflict = await raw('turns', { ...turn, input: { text: '我要茶。', source: 'typed' }, expectedVersion: state.version });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error.code).toBe('ID_CONFLICT');
  expect((await (await request.get(`${HARNESS}/api/sessions/${state.sessionId}`)).json()).state.version).toBe(state.version);

  for (const text of ['那就茶吧。', '茶十元。']) await send('turns', { turnId: `t-${++n}`, npcId: 'xiaolin', input: { text, source: 'typed' } });
  await act({ type: 'choose', choiceId: 'p1.pay-cafe' });
  await act({ type: 'playCue', cueId: 'p1.station-directions', channel: 'validation-text' });
  const xpBefore = state.xp;
  const clear = await act({ type: 'moveZone', zoneId: 'concourse' }, 'a-clear');
  expect(state.status).toBe('cleared');
  expect(state.xp).toBeGreaterThan(xpBefore);

  // Action replay of the reward-granting move: identical body, reward granted once.
  const again = await raw('actions', { actionId: 'a-clear', action: { type: 'moveZone', zoneId: 'concourse' }, expectedVersion: 1 });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual(clear);
  const reused = await raw('actions', { actionId: 'a-clear', action: { type: 'moveZone', zoneId: 'cafe' }, expectedVersion: state.version });
  expect(reused.status()).toBe(409);
  expect((await reused.json()).error.code).toBe('ID_CONFLICT');
  const final: PublicState = (await (await request.get(`${HARNESS}/api/sessions/${state.sessionId}`)).json()).state;
  expect(final.xp).toBe(state.xp);
  expect(final.badges).toEqual(state.badges);
  expect(final.version).toBe(state.version);
});

test('a stale expectedVersion returns STALE_VERSION and the UI resynchronizes', async ({ page, request }) => {
  await start(page, 'fixture');
  const id = (await sessionId(page))!;
  const footer = page.locator('.session-footer');
  const shown = await serverState(request, id);
  await expect(footer).toContainText(`Version ${shown.version}`);

  // Another tab advances the session behind this UI's back.
  const bump = await request.post(`/api/sessions/${id}/actions`, { data: { actionId: `other-tab-${Date.now()}`, expectedVersion: shown.version, action: { type: 'setInputPreference', preference: 'typed-accessibility' } } });
  expect(bump.status()).toBe(200);
  const ahead: PublicState = (await bump.json()).state;
  const stale = await request.post(`/api/sessions/${id}/actions`, { data: { actionId: `late-${Date.now()}`, expectedVersion: shown.version, action: { type: 'setInputPreference', preference: 'voice' } } });
  expect(stale.status()).toBe(409);
  const staleBody = await stale.json();
  expect(staleBody.error).toMatchObject({ code: 'STALE_VERSION', retryable: true });
  expect(staleBody.state.version).toBe(ahead.version);
  await expect(footer).toContainText(`Version ${shown.version}`);

  // The UI's next action is stale; the error carries state and the UI adopts it.
  await page.getByRole('button', { name: /^Pause/ }).click();
  const recovery = page.getByTestId('recovery-panel');
  await expect(recovery).toContainText('Your session needs a refresh.');
  await expect(recovery).toContainText('STALE_VERSION');
  await expect(footer).toContainText(`Version ${ahead.version}`);
  await recovery.getByRole('button', { name: 'Retry request' }).click();
  await expect(recovery).toHaveCount(0);
  await expect.poll(async () => (await serverState(request, id)).version).toBe(ahead.version + 1);
  await expect(footer).toContainText(`Version ${ahead.version + 1}`);
});
