import { expect, test, type Page } from '../../../../tests/support/browser-test';

test.use({ renderProfile: 'full' });
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
  const code = `Key${key.toUpperCase()}`;
  // Stop within the browser's animation loop. A CI protocol round trip can
  // take several frames and otherwise overshoot from a sign into an NPC.
  const stopped = page.getByTestId('world-renderer').evaluate((root, options) => new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + 15000;
    const release = () => root.dispatchEvent(new KeyboardEvent('keyup', { code: options.code, bubbles: true }));
    const watch = () => {
      const position = Number(root.getAttribute(`data-position-${options.axis}`));
      if (position * options.direction >= options.destination * options.direction) { release(); resolve(); }
      else if (performance.now() >= deadline) { release(); reject(new Error(`Walking ${options.code} stopped at ${position}, expected ${options.destination}`)); }
      else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), { code, axis, destination, direction });
  await page.keyboard.down(key);
  try { await stopped; }
  finally { await page.keyboard.up(key); }
}
async function actions(page: Page) { return JSON.parse(await page.getByTestId('actions').innerText()); }

test('signs are inert while NPC, focus and held-key interactions use shared callbacks once', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-chunks', '9');
  await expect(page.locator('[data-target-id]')).toHaveCount(0);
  await walk(page, 'w', 'z', 6.3, -1);
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await walk(page, 'a', 'x', 16.3, -1);
  await walk(page, 'w', 'z', 4.6, -1);
  await page.keyboard.down('e');
  await page.keyboard.down('e');
  await page.keyboard.up('e');
  await expect(page.getByRole('dialog', { name: 'NPC conversation' })).toContainText('fixture.vendor');
  await page.waitForTimeout(150);
  const beforeTyping = await coordinate(page, 'z');
  await page.getByRole('textbox', { name: 'Dialogue input' }).fill('wasd 你好');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => coordinate(page, 'z')).toBe(beforeTyping);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sent = await actions(page);
  expect(sent.every((a: { type: string }) => a.type === 'move')).toBe(true);
  expect(sent.filter((a: { type: string }) => a.type === 'move').every((a: { position: { x: number; z: number } }) => Number.isFinite(a.position.x) && Number.isFinite(a.position.z))).toBe(true);
  await expect(page.getByTestId('reward-state')).toHaveText('{"xp":0,"badges":[],"inventory":{"hint":0,"cny":20,"drinks":[]}}');
});

test('the payment choice carries its anchor and duplicate clicks are locked', async ({ page }) => {
  await open(page);
  await walk(page, 'w', 'z', 4.6, -1);
  await walk(page, 'a', 'x', 12.4, -1);
  await page.getByLabel('Delay callback', { exact: true }).check();
  await page.locator('[data-target-id="fixture.pay"]').evaluate((node: HTMLButtonElement) => { node.click(); node.click(); });
  await expect.poll(async () => (await actions(page)).filter((a: { type: string }) => a.type === 'choose')).toEqual([{ type: 'choose', choiceId: 'q1.pay', anchorId: 'fixture.pay' }]);
  await expect(page.getByTestId('reward-state')).toContainText('"xp":0');
});

test('creek water blocks walking and the level bridge carries the player across', async ({ page }) => {
  await open(page);
  await walk(page, 'd', 'x', 23.5, 1);
  await page.keyboard.down('d'); await page.waitForTimeout(600); await page.keyboard.up('d');
  expect(await coordinate(page, 'x')).toBeLessThan(24);
  await walk(page, 's', 'z', 20, 1);
  await walk(page, 'd', 'x', 30, 1);
  expect(await coordinate(page, 'x')).toBeGreaterThanOrEqual(30);
});

test('a failed callback records nothing; a lost WebGL context preserves the shell', async ({ page }) => {
  await open(page);
  await walk(page, 'w', 'z', 4.6, -1);
  await walk(page, 'a', 'x', 16.3, -1);
  await page.getByLabel('Fail callback', { exact: true }).check();
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Fail callback', { exact: true }).uncheck();
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('canvas').evaluate((canvas) => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.getByTestId('webgl-recovery')).toBeVisible();
  await expect(page.locator('[data-target-id]')).toHaveCount(0);
  await expect(page.getByTestId('reward-state')).toContainText('"xp":0');
});

test('a detached canvas context loss does not show compatibility recovery', async ({ page }) => {
  await open(page);
  await page.locator('canvas').evaluate((canvas) => {
    const parent = canvas.parentNode!;
    const next = canvas.nextSibling;
    parent.removeChild(canvas);
    try {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    } finally {
      parent.insertBefore(canvas, next);
    }
  });
  // Allow a state update from the old listener to reach the DOM.
  await page.waitForTimeout(100);
  // Canvas fallback HTML exists even with WebGL; recovery must not replace it.
  await expect(page.locator('[data-testid="webgl-recovery"]:not(canvas *)')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
});

test('world renders frames and camera-relative controls; demo laptop meets 30 fps', async ({ page }) => {
  // Segment-004 requires 30 FPS on the actual demo laptop. Cloud runners use
  // software WebGL: always exercise rendering/controls here, and explicitly
  // enable the unchanged hardware acceptance gate when measuring that laptop.
  const demoLaptop = process.env.VIBEQUEST_DEMO_LAPTOP === '1';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-fps', /./, { timeout: 15000 });
  const rates: number[] = [];
  for (let sample = 0; sample < 3; sample++) {
    await page.waitForTimeout(2100);
    rates.push(Number(await page.getByTestId('world-renderer').getAttribute('data-fps')));
  }
  const renderer = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl?.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'Unavailable';
  });
  const measurement = {
    viewport: page.viewportSize(), samples: rates, renderer,
    environment: demoLaptop ? 'confirmed demo laptop' : 'browser smoke runner',
    acceptanceTargetFps: demoLaptop ? 30 : null,
    method: 'R3F rendered frame count divided by elapsed frame time, three 2-second windows after warm-up',
  };
  await test.info().attach('frame-rate', { body: JSON.stringify(measurement), contentType: 'application/json' });
  await writeFile('test-results/world-performance.json', JSON.stringify(measurement, null, 2));
  expect(rates.every((rate) => Number.isFinite(rate) && rate > 0), `Rendering must advance: ${rates}; ${fixtureLog}`).toBe(true);
  if (demoLaptop) expect(Math.min(...rates), `Demo laptop FPS samples: ${rates}; ${fixtureLog}`).toBeGreaterThanOrEqual(30);
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
