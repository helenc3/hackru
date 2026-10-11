import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { PublicState } from '@vibequest/shared';
import { harness, HARNESS, interact, playerState, serverState, sessionId, startWorld, walkRoute } from './helpers';

// Real-server recovery journeys. The configured servers carry no provider keys, so live
// dialogue calls fail as recoverable 503s. The restart test spawns its own production server it can kill.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RESTART_PORT = Number(process.env.E2E_RESTART_PORT ?? 4480);

/** 小林 stands 5 m east of spawn. */
async function reachVendor(page: Page, request: Parameters<typeof playerState>[1]) {
  const state = await playerState(page, request);
  const vendor = state.interactables.find((entry) => entry.role === 'vendor' && entry.label === '小林')!;
  await walkRoute(page, [{ x: vendor.position.x - 1.2, z: state.position.z }]);
  await interact(page, vendor.id);
  const panel = page.getByTestId('dialogue-panel');
  const typed = panel.getByRole('button', { name: 'Use typed Mandarin', exact: true });
  if (await typed.count()) await typed.click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  return panel;
}
const progress = (state: PublicState) => ({ missionId: state.missionId, status: state.status, objectives: state.objectives, inventory: state.inventory, xp: state.xp, badges: state.badges, purchases: state.purchases });

test('live AI outage shows a retryable recovery, keeps the draft, and changes no progress', async ({ page, request }) => {
  await startWorld(page, 'live');
  const panel = await reachVendor(page, request);
  const id = (await sessionId(page))!;
  const before = await serverState(request, id);
  expect(before.providerStatus).toBe('live');
  const opener = await panel.getByTestId('npc-reply').innerText();

  await panel.getByRole('textbox').fill('我要咖啡。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  const recovery = page.getByTestId('recovery-panel');
  await expect(recovery).toContainText('PROVIDER_UNAVAILABLE');
  await expect(recovery.getByRole('button', { name: 'Retry request' })).toBeVisible();
  await expect(panel.getByRole('textbox')).toHaveValue('我要咖啡。');
  await expect(panel.getByTestId('npc-reply')).toHaveText(opener); // no reply beyond the authored opener

  await recovery.getByRole('button', { name: 'Retry request' }).click();
  await expect(recovery).toContainText('PROVIDER_UNAVAILABLE');
  await expect(panel.getByRole('textbox')).toHaveValue('我要咖啡。');
  await expect(panel.getByRole('textbox')).toBeEnabled();

  const after = await serverState(request, id);
  expect(after.status).toBe('active');
  expect(progress(after)).toEqual(progress(before));
  expect(after.version).toBeGreaterThan(before.version); // only provider bookkeeping advanced
  await expect(recovery).toContainText(`Version ${after.version}`);
});

test('fixture reply audio failure degrades to the Mandarin subtitle without blocking the purchase', async ({ page, request }) => {
  await startWorld(page, 'fixture');
  const panel = await reachVendor(page, request);
  await page.locator('summary[aria-label="Settings"]').click();
  const audio = page.getByTestId('audio-controller');
  for (const [index, line] of ['我要咖啡。', '那就茶吧。', '茶十元。'].entries()) {
    const before = await panel.getByTestId('npc-reply').innerText();
    await panel.getByRole('textbox').fill(line);
    await panel.getByRole('button', { name: 'Send Mandarin' }).click();
    await expect(panel.getByRole('textbox')).toHaveValue('');
    await expect(panel.getByTestId('npc-reply')).not.toHaveText(before);
    if (index === 0) {
      // No ElevenLabs key: the speech job fails and the subtitle stays the channel.
      await expect(audio.getByRole('status')).toHaveText('Reply audio is unavailable. Retry or read the reply.', { timeout: 15000 });
      await expect(audio.getByRole('button', { name: 'Retry audio' })).toBeVisible();
      await expect(page.getByTestId('recovery-panel')).toHaveCount(0);
      await page.locator('summary[aria-label="Settings"]').click();
    }
  }
  await page.getByTestId('pay-button').click();
  await expect.poll(async () => (await playerState(page, request)).purchases.length).toBe(1);
});

test('server restart expires the stored session and a fresh start reopens the same world', async ({ page }) => {
  const base = `http://127.0.0.1:${RESTART_PORT}`;
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', PORT: String(RESTART_PORT), ENABLE_DEMO_FIXTURES: 'true', ENABLE_VALIDATION_HARNESS: 'false' };
  for (const key of Object.keys(env)) if (/GEMINI|ELEVENLABS|ANTHROPIC/.test(key)) delete env[key];
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
    await startWorld(page, 'fixture', base);
    const old = await sessionId(page);
    const worldId = await page.getByTestId('world-renderer').getAttribute('data-world-id');
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

    // The restarted server holds no manifests: the browser restores the pinned spawn box before movement.
    await page.getByLabel('Conversation provider').selectOption('fixture');
    await page.getByRole('button', { name: 'Start exploring' }).click();
    await expect.poll(async () => Number(await page.getByTestId('world-renderer').getAttribute('data-chunks')), { timeout: 60000 }).toBeGreaterThanOrEqual(9);
    await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-world-id', worldId!);
    const fresh = await sessionId(page);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(old);
    expect((await fetch(`${base}/api/sessions/${fresh}`)).status).toBe(200);
  } finally { await halt(); }
});

test('replayed action and turn IDs are idempotent, reused IDs conflict, and one reward is granted', async ({ request }) => {
  const h = await harness(request);
  await h.goto(h.state.position);
  const vendor = h.anchor((entry) => entry.role === 'vendor' && entry.label === '小林');
  await h.goto({ x: vendor.position.x - 1.2, z: vendor.position.z });

  // Turn replay: the identical response, no second evaluation.
  const turn = { turnId: 't-1', npcId: 'vendor', anchorId: vendor.id, input: { text: '我要咖啡。', source: 'typed' } };
  const first = await h.send('turns', turn);
  const replay = await h.raw('turns', { ...turn, expectedVersion: 0 });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual(first);
  const conflict = await h.raw('turns', { ...turn, input: { text: '我要茶。', source: 'typed' }, expectedVersion: h.state.version });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).error.code).toBe('ID_CONFLICT');
  expect((await (await request.get(`${HARNESS}/api/sessions/${h.state.sessionId}`)).json()).state.version).toBe(h.state.version);

  for (const text of ['那就茶吧。', '茶十元。']) await h.talk(vendor.id, 'vendor', text);
  const xpBefore = h.state.xp;
  const pay = { type: 'choose', choiceId: 'q1.pay', anchorId: vendor.id } as const;
  const clear = await h.act(pay, 200, 'a-clear');
  expect(h.state).toMatchObject({ status: 'cleared', inventory: { cny: 10 } });
  expect(h.state.xp).toBeGreaterThan(xpBefore);

  // Replaying the reward-granting payment returns the identical body; money and reward move once.
  const again = await h.raw('actions', { actionId: 'a-clear', action: pay, expectedVersion: 1 });
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual(clear);
  const reused = await h.raw('actions', { actionId: 'a-clear', action: { type: 'setInputPreference', preference: 'voice' }, expectedVersion: h.state.version });
  expect(reused.status()).toBe(409);
  expect((await reused.json()).error.code).toBe('ID_CONFLICT');
  const final: PublicState = (await (await request.get(`${HARNESS}/api/sessions/${h.state.sessionId}`)).json()).state;
  expect(final).toMatchObject({ xp: h.state.xp, badges: h.state.badges, version: h.state.version, inventory: { cny: 10 } });
  expect(final.purchases).toHaveLength(1);
});

test('a stale expectedVersion returns STALE_VERSION and the UI resynchronizes', async ({ page, request }) => {
  await startWorld(page, 'fixture');
  const id = (await sessionId(page))!;
  const shown = await serverState(request, id);

  // Another tab advances the session behind this UI's back.
  const bump = await request.post(`/api/sessions/${id}/actions`, { data: { actionId: `other-tab-${Date.now()}`, expectedVersion: shown.version, action: { type: 'setInputPreference', preference: 'typed-accessibility' } } });
  expect(bump.status()).toBe(200);
  const ahead: PublicState = (await bump.json()).state;
  const stale = await request.post(`/api/sessions/${id}/actions`, { data: { actionId: `late-${Date.now()}`, expectedVersion: shown.version, action: { type: 'setInputPreference', preference: 'voice' } } });
  expect(stale.status()).toBe(409);
  const staleBody = await stale.json();
  expect(staleBody.error).toMatchObject({ code: 'STALE_VERSION', retryable: true });
  expect(staleBody.state.version).toBe(ahead.version);

  await page.getByRole('button', { name: /^Pause/ }).click();
  const recovery = page.getByTestId('recovery-panel');
  await expect(recovery).toContainText('Your session needs a refresh.');
  await expect(recovery).toContainText('STALE_VERSION');
  await expect(recovery).toContainText(`Version ${ahead.version}`);
  await recovery.getByRole('button', { name: 'Retry request' }).click();
  await expect(recovery).toHaveCount(0);
  await expect.poll(async () => (await serverState(request, id)).version).toBe(ahead.version + 1);
});
