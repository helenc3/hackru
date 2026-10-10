import { test, expect } from '@playwright/test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';

async function start(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
}
async function typedPanel(page: import('@playwright/test').Page, npc = '小林') {
  await page.getByRole('button', { name: `${npc} · Talk`, exact: true }).click();
  const panel = page.getByTestId('dialogue-panel');
  await expect(panel).toBeVisible();
  if (await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).count()) await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeVisible();
  return panel;
}

test('production world, sign, voice slot, typed accessibility and practice feedback share one session', async ({ page }) => {
  const api = await installScriptedApi(page, { steps: [
    { action: { type: 'inspect', targetId: 'p1.entrance-sign' }, patch: { visibleCues: [{ id: 'p1.entrance-sign', label: '入口告示', text: '请从广场进入。这扇门关闭了。' }] } },
    { text: '请给我一杯水。', reply: '一杯水五元。', feedback: true },
  ] });
  await start(page);
  await page.getByRole('button', { name: '入口告示 · Read sign' }).click();
  await expect(page.getByRole('dialog', { name: 'Inspected sign' })).toContainText('请从广场进入');
  const panel = await typedPanel(page);
  await expect(panel.getByTestId('recorder')).toBeVisible();
  await panel.getByRole('textbox').fill('请给我一杯水。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('npc-reply')).toContainText('一杯水五元。');
  await expect(panel.getByTestId('coach-panel')).toContainText('Your request was understood.');
  await expect(panel.getByRole('meter')).toHaveCount(3);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByTestId('world-renderer')).toBeVisible();
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /validation|text mode/i })).toHaveCount(0);
  expect(api.remaining()).toBe(0); expect(api.failures).toEqual([]);
  const turn = api.requests.find((request) => request.path.endsWith('/turns'))?.body as { input: { source: string } };
  expect(turn.input.source).toBe('typed');
});

test('Chinese IME Enter waits for composition to finish and the focused panel contains movement keys', async ({ page }) => {
  const api = await installScriptedApi(page, { steps: [{ text: '我要水。', reply: '好的。', feedback: true }] });
  await start(page); const panel = await typedPanel(page);
  const input = panel.getByRole('textbox');
  // fill() can end composition in Firefox; establish the draft before simulating IME.
  await input.fill('我要水。');
  await input.dispatchEvent('compositionstart', { data: '我要水' });
  await input.press('Enter');
  expect(api.requests.filter((request) => request.path.endsWith('/turns'))).toHaveLength(0);
  await page.evaluate(() => { (window as unknown as { movementKeys: string[] }).movementKeys = []; window.addEventListener('keydown', (event) => { if (['w', 'a', 's', 'd'].includes(event.key)) (window as unknown as { movementKeys: string[] }).movementKeys.push(event.key); }); });
  await input.press('w');
  expect(await page.evaluate(() => (window as unknown as { movementKeys: string[] }).movementKeys)).toEqual([]);
  await input.fill('我要水。'); await input.dispatchEvent('compositionend', { data: '我要水。' }); await input.press('Enter');
  await expect(panel.getByTestId('npc-reply')).toContainText('好的。');
  expect(api.requests.filter((request) => request.path.endsWith('/turns'))).toHaveLength(1);
});

test('active boss omits coaching, hints, freeze, scores and suggested answers', async ({ page }) => {
  await installScriptedApi(page, { mission: 'B1', steps: [{ text: '我要一张去海港的票。', reply: '一张去海港的票，十五元。' }] });
  await start(page); const panel = await typedPanel(page, '老周');
  await panel.getByRole('textbox').fill('我要一张去海港的票。'); await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('npc-reply')).toContainText('十五元');
  await expect(page.getByTestId('coach-panel')).toHaveCount(0);
  await expect(page.getByRole('meter')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /hint|freeze|Pause & Learn/i })).toHaveCount(0);
  await expect(panel).not.toContainText('Improved example');
});

test('Continue fetches the server state and expired sessions offer a fresh start', async ({ page }) => {
  const api = await installScriptedApi(page);
  await start(page); await page.reload();
  await page.getByRole('button', { name: 'Continue Session' }).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await page.reload();
  api.failNext({ status: 404, code: 'SESSION_EXPIRED', message: 'The server restarted. Start a fresh session.', retryable: false });
  await page.getByRole('button', { name: 'Continue Session' }).click();
  await expect(page.getByTestId('recovery-panel')).toContainText('This session has expired.');
  await page.getByRole('button', { name: 'Start a fresh session' }).click();
  await expect(page.getByRole('button', { name: 'Continue Session' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'))).toBeNull();
});

test('provider retry retains the turn ID and Mandarin draft without granting client rewards', async ({ page }) => {
  const api = await installScriptedApi(page, { steps: [{ text: '我要水。', reply: '好的。', feedback: true }] });
  await start(page); const panel = await typedPanel(page);
  await panel.getByRole('textbox').fill('我要水。');
  api.failNext({ status: 503, code: 'PROVIDER_UNAVAILABLE', message: 'The language provider is unavailable. Retry this turn.', retryable: true });
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(page.getByTestId('recovery-panel')).toContainText('Retry this turn.');
  await expect(panel.getByRole('textbox')).toHaveValue('我要水。');
  await expect(page.getByTestId('inventory-bar')).toContainText('XP 0');
  api.patch({ version: 7 });
  await page.getByRole('button', { name: 'Retry request' }).click();
  await expect(panel.getByTestId('npc-reply')).toContainText('好的。');
  await expect(panel.getByRole('textbox')).toHaveValue('');
  const turns = api.requests.filter((request) => request.path.endsWith('/turns')).map((request) => request.body as { turnId: string; expectedVersion: number });
  expect(turns).toHaveLength(2); expect(turns[0].turnId).toBe(turns[1].turnId);
  expect(turns[1].expectedVersion).toBe(7);
});

test('stale responses synchronize authoritative state and preserve typed input', async ({ page }) => {
  const api = await installScriptedApi(page);
  await start(page); const panel = await typedPanel(page); await panel.getByRole('textbox').fill('我要水。');
  api.patch({ version: 9, xp: 80 });
  api.failNext({ status: 409, code: 'STALE_VERSION', message: 'Another action completed. Refresh before sending again.', retryable: false });
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(page.getByTestId('recovery-panel')).toContainText('Your session needs a refresh.');
  await expect(page.getByTestId('inventory-bar')).toContainText('XP 80');
  await expect(panel.getByRole('textbox')).toHaveValue('我要水。');
  await page.getByTestId('recovery-panel').getByRole('button', { name: 'Refresh session' }).click();
  await expect(page.getByTestId('recovery-panel')).toHaveCount(0);
});

test('microphone denial offers the same-panel typed fallback without starting capture', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) }, configurable: true }); });
  await installScriptedApi(page); await page.goto('/');
  await page.getByRole('button', { name: 'Check microphone' }).click();
  await expect(page.getByTestId('start-panel')).toContainText('Microphone permission was denied.');
});

test('an unavailable WebGL context keeps the session and shared recovery interface', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) { return typeof args[0] === 'string' && args[0].startsWith('webgl') ? null : original.apply(this, args); } as typeof original; });
  await installScriptedApi(page); await start(page);
  await expect(page.getByTestId('webgl-recovery')).toBeVisible();
  await expect(page.getByTestId('quest-panel')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'))).toBe('ui-player-P1');
});

test('countdown display waits for the server to end the attempt', async ({ page }) => {
  const api = await installScriptedApi(page, { mission: 'B1' });
  api.patch({ timer: { remainingMs: 1000, running: true, syncedAtMs: Date.now() } });
  await start(page);
  await expect(page.getByRole('timer')).toContainText('0:00');
  await expect(page.getByTestId('result-panel')).toHaveCount(0);
  api.patch({ status: 'failed', timer: { remainingMs: 0, running: false, syncedAtMs: Date.now() } });
  await expect(page.getByTestId('result-panel')).toContainText('Try a fresh route.');
});


test('mission restart completes during a pending provider turn and ignores its late reply', async ({ page }) => {
  const api = await installScriptedApi(page, { steps: [
    { action: { type: 'retryMission' }, patch: { xp: 0 } },
    { text: '我要茶。', reply: '茶十元。', feedback: true },
  ] });
  let release: () => void = () => undefined;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  let first = true;
  await page.route('**/api/sessions/*/turns', async (route) => {
    if (!first) return route.fallback();
    first = false;
    const input = route.request().postDataJSON() as { turnId: string };
    api.patch({ version: api.state().version + 1 });
    const old = { ...api.state(), version: 99, xp: 999 };
    await deferred;
    await route.fulfill({ json: { turnId: input.turnId, state: old, events: [], npcReply: '旧回复。', speechId: 'old-attempt-speech' } });
  });
  await start(page); const panel = await typedPanel(page);
  await panel.getByRole('textbox').fill('我要水。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel).toContainText('Waiting for the server');
  await expect(page.getByRole('button', { name: 'Restart mission' })).toBeEnabled();
  await page.getByRole('button', { name: 'Restart mission' }).click();
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '小林 · Talk', exact: true })).toBeEnabled();
  release();
  const fresh = await typedPanel(page);
  await fresh.getByRole('textbox').fill('我要茶。');
  await fresh.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(fresh.getByTestId('npc-reply')).toContainText('茶十元。');
  await expect(page.getByTestId('inventory-bar')).toContainText('XP 0');
  await expect(page.getByTestId('game-shell')).not.toContainText('旧回复');
  expect(api.failures).toEqual([]); expect(api.remaining()).toBe(0);
});
