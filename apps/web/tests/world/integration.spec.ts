import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'node:net';
import { chunkKey, inSpawnBox, type ChunkCoord, type ChunkManifest } from '@vibequest/shared';
import { fixtureChunk } from '../../../../fixtures/world/city';

// Streaming against mocked city routes: first visit generates, reload restores spawn from IndexedDB
// and makes zero spawn-chunk generation requests (CITY_GENERATION §6, §9).
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

test('streams the neighbourhood, persists it, and restores spawn without regenerating it', async ({ page }) => {
  const requested: ChunkCoord[][] = [];
  const restored: ChunkManifest[][] = [];
  const committed = new Map<string, ChunkManifest>();
  await page.route(/\/api\/sessions\/fixture-session\/chunks\/restore$/, async (route) => {
    const { chunks } = route.request().postDataJSON() as { chunks: ChunkManifest[] };
    restored.push(chunks);
    await route.fulfill({ json: { accepted: chunks.map((c) => chunkKey(c.coord)), rejected: [], chunks } });
  });
  await page.route(/\/api\/sessions\/fixture-session\/chunks$/, async (route) => {
    const { coords } = route.request().postDataJSON() as { coords: ChunkCoord[] };
    requested.push(coords);
    const chunks = coords.map((coord) => committed.get(chunkKey(coord)) ?? fixtureChunk('stream-world', coord));
    for (const chunk of chunks) committed.set(chunkKey(chunk.coord), chunk);
    await route.fulfill({ json: { chunks, pending: [] } });
  });
  const world = page.getByTestId('world-renderer');
  await page.goto(fixtureUrl);
  await expect.poll(async () => Number(await world.getAttribute('data-chunks'))).toBeGreaterThanOrEqual(9);
  expect(restored).toEqual([]); // empty IndexedDB: nothing to restore
  expect(requested.flat().some((coord) => chunkKey(coord) === '0,0')).toBe(true);
  expect(requested.every((batch) => batch.length <= 6)).toBe(true);
  await expect(page.getByTestId('city-loading')).toHaveCount(0);
  await expect(world).toHaveAttribute('data-position-x', /./);
  await page.waitForTimeout(300); // let IndexedDB writes settle

  requested.length = 0;
  await page.reload();
  await expect.poll(async () => Number(await world.getAttribute('data-chunks'))).toBeGreaterThanOrEqual(9);
  expect(restored).toHaveLength(1);
  expect(restored[0]!.filter((c) => inSpawnBox(c.coord))).toHaveLength(9);
  expect(requested.flat().filter((coord) => inSpawnBox(coord))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('vibequest.worldId'))).toBe('stream-world');
});
