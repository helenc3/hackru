import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '../support/browser-test';
import type { PublicState } from '@vibequest/shared';
import { interact, playerState, serverState, sessionId, SMALL_TALK, startWorld, walkToQuestTarget } from './helpers';

// Real-server recovery journeys. The configured servers carry no provider keys, so live
// dialogue calls fail as recoverable 503s. The restart test spawns its own production server it can kill.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RESTART_PORT = Number(process.env.E2E_RESTART_PORT ?? 4480);

/** 老王 is Q1's quest target, a few metres from spawn. */
async function reachVendor(page: Page, request: Parameters<typeof playerState>[1]) {
  await walkToQuestTarget(page);
  const state = await playerState(page, request);
  const vendor = state.interactables.find((entry) => entry.role === 'vendor' && entry.label === '老王')!;
  await interact(page, vendor.id);
  const panel = page.getByTestId('dialogue-panel');
  const typed = panel.getByRole('button', { name: 'Use typed Mandarin', exact: true });
  // Wait for the panel to settle on voice or typed input before choosing, or the toggle can be missed.
  await expect(panel.getByRole('textbox').or(typed)).toBeVisible();
  if (await typed.isVisible()) await typed.click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  return panel;
}
const progress = (state: PublicState) => ({ missionId: state.missionId, status: state.status, objectives: state.objectives, inventory: state.inventory, xp: state.xp, badges: state.badges, purchases: state.purchases });

test.use({ movementMultiplier: 8 });

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

test('fixture recovery: stale versions resynchronize and failed audio does not block purchase', async ({ page, request }) => {
  await startWorld(page, 'fixture');
  const panel = await reachVendor(page, request);
  await test.step('stale version resynchronizes the existing world', async () => {

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

  await panel.getByRole('button', { name: 'Use voice', exact: true }).click();
  const recovery = page.getByTestId('recovery-panel');
  await expect(recovery).toContainText('Your session needs a refresh.');
  await expect(recovery).toContainText('STALE_VERSION');
  await expect(recovery).toContainText(`Version ${ahead.version}`);
  await recovery.getByRole('button', { name: 'Retry request' }).click();
  await expect(recovery).toHaveCount(0);
  await expect.poll(async () => (await serverState(request, id)).version).toBe(ahead.version + 1);

  });
  const typed = panel.getByRole('button', { name: 'Use typed Mandarin', exact: true });
  if (await typed.isVisible()) await typed.click();
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await page.locator('summary[aria-label="Settings"]').click();
  const audio = page.getByTestId('audio-controller');
  // 老王 chats a little (the goal warm-up) before he names a price.
  for (const [index, line] of ['我要咖啡。', ...SMALL_TALK, '那就茶吧。'].entries()) {
    const replies = panel.locator('.bubble.npc:not(.partial)');
    const before = await replies.count();
    await panel.getByRole('textbox').fill(line);
    await panel.getByRole('button', { name: 'Send Mandarin' }).click();
    await expect.poll(() => replies.count()).toBeGreaterThan(before);
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

test('server restart forgets the expired session and a fresh start creates a new world', async ({ page }) => {
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
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Start exploring' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Continue Session' })).toHaveCount(0);

    // Sessions and terrain share the server lifetime; a restart creates a new city.
    await page.getByLabel('Conversation provider').selectOption('fixture');
    await page.getByRole('button', { name: 'Start exploring' }).click();
    await expect.poll(async () => Number(await page.getByTestId('world-renderer').getAttribute('data-chunks')), { timeout: 60000 }).toBeGreaterThanOrEqual(9);
    await expect(page.getByTestId('world-renderer')).not.toHaveAttribute('data-world-id', worldId!);
    const fresh = await sessionId(page);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(old);
    expect((await fetch(`${base}/api/sessions/${fresh}`)).status).toBe(200);
  } finally { await halt(); }
});
