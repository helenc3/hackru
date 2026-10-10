import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

// Serve the owned callback fixture separately, never from the production server.
let fixtureServer: ChildProcess;
let fixtureLog = '';
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  fixtureServer = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'fixtures/world', '--config', 'fixtures/world/vite.config.ts'], { cwd: process.cwd(), stdio: 'pipe' });
  fixtureServer.stdout?.on('data', (chunk) => { fixtureLog += String(chunk); });
  fixtureServer.stderr?.on('data', (chunk) => { fixtureLog += String(chunk); });
  await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4174')).ok; } catch { return false; } }, { timeout: 30000, message: 'Fixture server must start' }).toBe(true);
});
test.afterAll(() => { fixtureServer?.kill(); });

async function open(page: Page) {
  await page.goto('http://127.0.0.1:4174');
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
  await walk(page, 'a', 'x', -9.8, -1);
  await walk(page, 'w', 'z', 6.1, -1);
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toContainText('请从广场进入。这扇门关闭了。');
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
  await page.locator('[data-target-id="p2.board-2"]').dblclick();
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
