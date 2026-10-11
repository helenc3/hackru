import { expect, test } from '../../../../tests/support/browser-test';
import { chunkKey, type ChunkCoord } from '@vibequest/shared';
import { ChunkStreamer, distanceToChunk, wantedChunks } from '../../src/city/streamer';
import { fixtureChunk } from '../../../../fixtures/world/city';

const near = { x: 20, z: 20 }; // centre of chunk (0,0)

test('wanted chunks: visible 3 × 3 first, then the prefetch ring ahead of travel', () => {
  const still = wantedChunks(near, { x: 0, z: 0 });
  expect(still).toHaveLength(25);
  expect(still[0]).toEqual({ cx: 0, cz: 0 });
  expect(still.slice(0, 9).every(({ cx, cz }) => Math.abs(cx) <= 1 && Math.abs(cz) <= 1)).toBe(true);
  const east = wantedChunks(near, { x: 1, z: 0 });
  expect(east[1]!.cx).toBe(1);
  expect(east[9]!.cx).toBe(2);
  expect(distanceToChunk({ x: 39, z: 20 }, { cx: 1, cz: 0 })).toBeCloseTo(1);
  expect(distanceToChunk(near, { cx: 0, cz: 0 })).toBe(0);
});

test('the streamer batches, bounds concurrency, dedupes, marks urgent work and retries pending', async () => {
  const calls: { coords: ChunkCoord[]; urgent: boolean; resolve: (pending: ChunkCoord[]) => void }[] = [];
  const committed: string[] = [];
  const streamer = new ChunkStreamer((coords, urgent) => new Promise((resolve) => calls.push({ coords, urgent, resolve: (pending) => resolve({ chunks: coords.filter((c) => !pending.some((p) => chunkKey(p) === chunkKey(c))).map((c) => fixtureChunk('w', c)), pending }) })),
    (manifests) => committed.push(...manifests.map((m) => chunkKey(m.coord))));
  streamer.update(near, 0);
  expect(calls).toHaveLength(2); // two in flight
  expect(calls.every((call) => call.coords.length <= 6)).toBe(true);
  expect(calls[0]!.coords[0]).toEqual({ cx: 0, cz: 0 });
  expect(calls[0]!.urgent).toBe(true); // the player stands in an uncommitted chunk
  expect(calls[0]!.coords.every((coord) => distanceToChunk(near, coord) <= 8)).toBe(true); // urgent chunks travel alone
  expect(calls[1]!.urgent).toBe(false); // farther chunks still get the generation deadline
  streamer.update({ x: 20.5, z: 20 }, 50); // same chunk within the tick: no new requests
  expect(calls).toHaveLength(2);
  const waiting = calls[1]!.coords.at(-1)!;
  calls[0]!.resolve([]);
  calls[1]!.resolve([waiting]); // one stays pending
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(committed).toHaveLength(calls[0]!.coords.length + calls[1]!.coords.length - 1);
  streamer.update(near, 100);
  const third = calls[2]!;
  expect(third.coords.map(chunkKey)).not.toContain(chunkKey(waiting)); // pending waits for its retry delay
  expect(third.coords.some((coord) => committed.includes(chunkKey(coord)))).toBe(false);
  third.resolve([]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  streamer.update(near, 1_200);
  expect(calls.at(-1)!.coords.map(chunkKey)).toContain(chunkKey(waiting));
});
