import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';

// Serve the owned callback fixture separately, never from the production server.
let fixtureServer: ChildProcess;
let fixtureLog = '';
let fixtureUrl = '';
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  const allocator = createServer();
  await new Promise<void>((resolve) => allocator.listen(0, '127.0.0.1', resolve));
  const address = allocator.address();
  if (!address || typeof address === 'string') throw new Error('Cannot allocate world fixture port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => allocator.close((error) => error ? reject(error) : resolve()));
  fixtureUrl = `http://127.0.0.1:${port}`;
  fixtureServer = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'fixtures/world', '--config', 'fixtures/world/vite.config.ts', '--port', String(port)], { cwd: process.cwd(), stdio: 'pipe' });
  fixtureServer.stdout?.on('data', (chunk) => { fixtureLog += String(chunk); });
  fixtureServer.stderr?.on('data', (chunk) => { fixtureLog += String(chunk); });
  await expect.poll(async () => { if (fixtureServer.exitCode !== null) throw new Error(fixtureLog); try { return (await fetch(fixtureUrl)).ok; } catch { return false; } }, { timeout: 30000, message: 'Fixture server must start' }).toBe(true);
});
test.afterAll(async () => {
  fixtureServer?.kill();
  await new Promise<void>((resolve) => {
    if (!fixtureServer || fixtureServer.exitCode !== null) return resolve();
    const deadline = setTimeout(() => { fixtureServer.kill('SIGKILL'); resolve(); }, 1500);
    fixtureServer.once('exit', () => { clearTimeout(deadline); resolve(); });
  });
});

async function open(page: Page) {
  await page.goto(fixtureUrl);
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-position-x', /./);
  await page.getByTestId('world-renderer').focus();
}
async function coordinate(page: Page, axis: 'x' | 'z') {
  return Number(await page.getByTestId('world-renderer').getAttribute(`data-position-${axis}`));
}
async function walk(page: Page, key: string, axis: 'x' | 'z', destination: number, direction: number) {
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.down(key);
  try { await expect.poll(async () => (await coordinate(page, axis)) * direction, { timeout: 15000, intervals: [50] }).toBeGreaterThanOrEqual(destination * direction); }
  finally { await page.keyboard.up(key); }
}
async function actions(page: Page) { return JSON.parse(await page.getByTestId('actions').innerText()); }

test('sign, NPC, focus and held-key interactions use shared callbacks once', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-target-id]')).toHaveCount(0);
  await walk(page, 'w', 'z', 6.1, -1);
  await walk(page, 'a', 'x', -9.8, -1);
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toContainText('请从广场进入。这扇门关闭了。');
  await page.waitForTimeout(150); // Position telemetry refreshes every 100 ms.
  const paused = await coordinate(page, 'z');
  await page.keyboard.press('w');
  await expect.poll(() => coordinate(page, 'z')).toBe(paused);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await walk(page, 'w', 'z', 4.1, -1);
  await page.keyboard.down('e');
  await page.keyboard.down('e');
  await page.keyboard.up('e');
  await expect(page.getByRole('dialog', { name: 'NPC conversation' })).toBeVisible();
  await page.waitForTimeout(150);
  const beforeTyping = await coordinate(page, 'z');
  await page.getByRole('textbox', { name: 'Dialogue input' }).fill('wasd 你好');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => coordinate(page, 'z')).toBe(beforeTyping);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sent = await actions(page);
  expect(sent.filter((a: { type: string }) => a.type === 'inspect')).toEqual([{ type: 'inspect', targetId: 'p1.entrance-sign' }]);
  expect(sent.every((a: { type: string }) => ['inspect', 'moveZone'].includes(a.type))).toBe(true);
  await expect(page.getByTestId('reward-state')).toHaveText('{"xp":0,"badges":[],"inventory":{"hint":0,"freeze":0}}');
});

test('PA and boarding IDs match the shared fixture and duplicate clicks are locked', async ({ page }) => {
  await open(page);
  await page.getByLabel('Mission', { exact: true }).selectOption('P2');
  await walk(page, 'w', 'z', -2, -1);
  await page.getByLabel('Delay callback', { exact: true }).check();
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.down('e'); await page.keyboard.down('e'); await page.keyboard.up('e');
  await expect.poll(async () => (await actions(page)).filter((a: { type: string }) => a.type === 'playCue')).toEqual([{ type: 'playCue', cueId: 'p2.platform-change', channel: 'audio' }]);
  await page.getByLabel('Delay callback', { exact: true }).uncheck();
  await walk(page, 'w', 'z', -11.8, -1);
  await page.locator('[data-target-id="p2.board-2"]').evaluate((node: HTMLButtonElement) => { node.click(); node.click(); });
  await expect.poll(async () => (await actions(page)).filter((a: { type: string }) => a.type === 'choose')).toEqual([{ type: 'choose', choiceId: 'p2.board-2' }]);
  await expect(page.getByTestId('reward-state')).toContainText('"xp":0');
});

test('failed callbacks offer retry; a lost WebGL context preserves the shell', async ({ page }) => {
  await open(page);
  await page.getByLabel('Mission', { exact: true }).selectOption('B1');
  await page.getByLabel('Fail callback', { exact: true }).check();
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  await expect(page.getByRole('alert')).toContainText('Fixture connection failed');
  await page.getByLabel('Fail callback', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('canvas').evaluate((canvas) => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.getByTestId('webgl-recovery')).toBeVisible();
  await expect(page.locator('[data-target-id]')).toHaveCount(0);
  await expect(page.getByTestId('reward-state')).toContainText('"xp":0');
});

test('demo laptop renders a visible avatar and camera-relative controls at 30 fps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-fps', /./, { timeout: 15000 });
  const rates: number[] = [];
  for (let sample = 0; sample < 3; sample++) {
    await page.waitForTimeout(2100);
    rates.push(Number(await page.getByTestId('world-renderer').getAttribute('data-fps')));
  }
  await test.info().attach('frame-rate', { body: JSON.stringify({ viewport: page.viewportSize(), samples: rates, method: 'R3F rendered frame count divided by elapsed frame time, three 2-second windows after warm-up on demo laptop' }), contentType: 'application/json' });
  const renderer = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl?.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'Unavailable';
  });
  await writeFile('test-results/world-performance.json', JSON.stringify({ viewport: page.viewportSize(), samples: rates, renderer, method: 'Three R3F frame-count / elapsed-time windows after warm-up in installed desktop Chrome on the confirmed demo laptop' }, null, 2));
  expect(Math.min(...rates), `FPS samples: ${rates}; ${fixtureLog}`).toBeGreaterThanOrEqual(30);
  const canvas = page.locator('canvas');
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 130, bounds.y + bounds.height / 2);
  await page.mouse.up();
  const before = await coordinate(page, 'x');
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  await expect.poll(() => coordinate(page, 'x')).toBeGreaterThan(before + .3);
  await page.screenshot({ path: 'test-results/world-demo-laptop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('unsupported WebGL keeps compatibility recovery in the app shell', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await page.goto(fixtureUrl);
  await expect(page.getByTestId('webgl-recovery')).toContainText('The district needs WebGL');
  await expect(page.getByRole('button', { name: 'Reload preview' })).toBeVisible();
  await expect(page.locator('[data-target-id]')).toHaveCount(0);
  await expect(page.getByTestId('reward-state')).toContainText('"xp":0');
  expect(await actions(page)).toEqual([]);
});
