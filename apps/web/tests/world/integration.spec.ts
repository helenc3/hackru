import { expect, test } from '../../../../tests/support/browser-test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'node:net';
import { chunkKey, type ChunkCoord, type ChunkManifest } from '@vibequest/shared';
import { fixtureChunk } from '../../../../fixtures/world/city';

// The server owns committed terrain; reload fetches the same chunks without browser restore.
let fixtureServer: ChildProcess;
let fixtureUrl = '';
test.beforeAll(async () => {
  const allocator = createServer();
  await new Promise<void>((resolve) => allocator.listen(0, '127.0.0.1', resolve));
  const address = allocator.address();
  if (!address || typeof address === 'string') throw new Error('Cannot allocate fixture port');
  await new Promise<void>((resolve) => allocator.close(() => resolve()));
  fixtureUrl = `http://127.0.0.1:${address.port}/?stream`;
  fixtureServer = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'fixtures/world', '--config', 'fixtures/world/vite.config.ts', '--port', String(address.port)], { cwd: process.cwd(), stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(fixtureUrl)).ok; } catch { return false; } }, { timeout: 30000 }).toBe(true);
});
test.afterAll(() => { fixtureServer?.kill(); });

test('streams server-owned terrain again after reload without uploading browser layouts', async ({ page }) => {
  const requested: ChunkCoord[][] = [];
  const restored: ChunkManifest[][] = [];
  const committed = new Map<string, ChunkManifest>();
  let generated = 0;
  await page.route(/\/api\/sessions\/fixture-session\/chunks\/restore$/, async (route) => {
    const { chunks } = route.request().postDataJSON() as { chunks: ChunkManifest[] };
    restored.push(chunks);
    await route.fulfill({ json: { accepted: chunks.map((c) => chunkKey(c.coord)), rejected: [], chunks } });
  });
  await page.route(/\/api\/sessions\/fixture-session\/chunks$/, async (route) => {
    const { coords } = route.request().postDataJSON() as { coords: ChunkCoord[] };
    requested.push(coords);
    const chunks = coords.map((coord) => {
      const existing = committed.get(chunkKey(coord));
      if (existing) return existing;
      generated++;
      return fixtureChunk('stream-world', coord);
    });
    for (const chunk of chunks) committed.set(chunkKey(chunk.coord), chunk);
    await route.fulfill({ json: { chunks, pending: [] } });
  });
  const world = page.getByTestId('world-renderer');
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => Number(await world.getAttribute('data-chunks'))).toBeGreaterThanOrEqual(9);
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => ({
    pixelRatio: canvas.width / canvas.clientWidth,
    antialias: canvas.getContext('webgl2')?.getContextAttributes()?.antialias,
  }))).toEqual({ pixelRatio: .5, antialias: false });
  expect(restored).toEqual([]);
  expect(requested.flat().some((coord) => chunkKey(coord) === '0,0')).toBe(true);
  expect(requested.every((batch) => batch.length <= 6)).toBe(true);
  await expect(page.getByTestId('city-loading')).toHaveCount(0);
  await expect(world).toHaveAttribute('data-position-x', /./);
  const firstVisitGenerated = generated;

  requested.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(async () => Number(await world.getAttribute('data-chunks'))).toBeGreaterThanOrEqual(9);
  expect(restored).toEqual([]);
  expect(requested.flat().some((coord) => chunkKey(coord) === '0,0')).toBe(true);
  expect(generated).toBe(firstVisitGenerated);
  expect(await page.evaluate(() => localStorage.getItem('vibequest.worldId'))).toBe('stream-world');
});
