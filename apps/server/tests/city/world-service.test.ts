import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { ChunkManifest, ChunkPlan, QuestContextSnapshot } from '@vibequest/shared';

// Scheduler tests run against small deterministic stand-ins for the shared planner/validator,
// so they pin the server's caching and timing rules independently of generator content.
// Only the frozen contract modules are loaded for real (the rest of the package may be mid-rewrite).
vi.mock('@vibequest/shared', async () => {
  const actual = {
    ...await import('../../../../packages/shared/src/contracts.js'),
    ...await import('../../../../packages/shared/src/city/contracts.js'),
    ...await import('../../../../packages/shared/src/city/catalog/index.js'),
  };
  const canonical = (_key: string, value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value;
  const hash = (m: object) => createHash('sha256').update(JSON.stringify({ ...m, contentHash: undefined }, canonical)).digest('hex');
  const plan = (_seed: string, coord: { cx: number; cz: number }): ChunkPlan => ({ coord, district: 'shopping', connectors: [], water: [], bridges: [], roads: [], requiredAnchors: [], neighbours: { north: 'shopping', east: 'shopping', south: 'shopping', west: 'shopping' } });
  const seal = (m: Omit<ChunkManifest, 'contentHash'>): ChunkManifest => ({ ...m, contentHash: hash(m) });
  return {
    ...actual,
    seedFromWorldId: (id: string) => `seed-${id}`,
    worldLayout: () => ({ spawn: { x: 20, z: 20 }, hotel: { coord: { cx: 2, cz: 0 }, anchorId: 'hotel.grand', local: { x: 20, z: 20 } }, river: { axis: 'z', center: 150, width: 30 } }),
    planChunk: plan,
    sealManifest: seal,
    verifyManifestHash: (m: ChunkManifest) => m.contentHash === hash(m),
    generateFallbackChunk: (worldId: string, seed: string, coord: { cx: number; cz: number }, questContext: QuestContextSnapshot) => seal({
      worldId, coord, district: 'shopping', catalogVersion: actual.CATALOG_VERSION, generatorVersion: actual.GENERATOR_VERSION, seed, source: 'fallback', questContext,
      connectors: [], roads: [], water: [], bridges: [], placements: [{ id: 'p1', assetId: 'bld.ok', params: {}, x: 10, z: 10, rotation: 0 }], anchors: [], missingCapabilities: [],
    }),
    validateManifest: (m: ChunkManifest) => {
      const bad = m.placements.filter((entry) => entry.assetId !== 'bld.ok').map((entry) => `unknown asset ${entry.assetId}`);
      return bad.length ? { ok: false, errors: bad } : { ok: true };
    },
    repairManifest: () => null,
    createWorldView: (worldId: string) => ({ worldId }),
  };
});

const { createWorldService } = await import('../../src/city/world-service.js');
const { createClaudeCityComposer, CITY_INSTRUCTION } = await import('../../src/city/claude-city.js');

const weights = { 'drink-vendor': 1.2, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 };
const quest: QuestContextSnapshot = { missionId: 'Q1', weights };
const draft = (assetId = 'bld.ok') => ({ placements: [{ id: 'c1', assetId, x: 12, z: 12, rotation: 90, params: [], attachTo: null }], roads: [], anchors: [], missingCapabilities: ['pagoda roof'] });
type Reply = object | Error | 'HANG' | 'REFUSAL';
function fakeClaude(...replies: Reply[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let inFlight = 0; let peak = 0;
  const create = vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming, { signal }: { signal: AbortSignal }) => {
    calls.push(params);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    inFlight++; peak = Math.max(peak, inFlight);
    try {
      if (reply === 'HANG') await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (reply instanceof Error) throw reply;
      const text = reply === 'REFUSAL' ? '' : JSON.stringify(reply);
      return { content: [{ type: 'text', text }], stop_reason: reply === 'REFUSAL' ? 'refusal' : 'end_turn', usage: { input_tokens: 100, output_tokens: 50 } } as unknown as Anthropic.Message;
    } finally { inFlight--; }
  });
  const composer = createClaudeCityComposer({ apiKey: 'test-key', model: 'test-model', client: { create } });
  return { calls, create, composer, peak: () => peak };
}
function service(replies: Reply[], rules = {}) {
  const claude = fakeClaude(...replies);
  const logs: Record<string, unknown>[] = [];
  const worlds = createWorldService({ composer: claude.composer, rules: { deadlineMs: 300, ...rules }, log: (entry) => logs.push(entry) });
  const { worldId } = worlds.open();
  return { worlds, worldId, claude, logs };
}

describe('world service', () => {
  it('commits a validated Claude chunk once; cache hits make zero calls', async () => {
    const { worlds, worldId, claude } = service([draft()]);
    const first = await worlds.request('s1', worldId, [{ cx: 0, cz: 0 }], false, quest);
    expect(first.chunks[0]).toMatchObject({ source: 'claude', missingCapabilities: ['pagoda roof'] });
    const again = await worlds.request('s2', worldId, [{ cx: 0, cz: 0 }], false, quest);
    expect(again.chunks[0]).toBe(first.chunks[0]);
    expect(claude.calls).toHaveLength(1);
    const system = String(claude.calls[0]!.system);
    expect(system).toContain(CITY_INSTRUCTION);
    expect(JSON.stringify(claude.calls[0])).not.toContain('test-key');
    expect(claude.calls[0]!.output_config).toMatchObject({ format: { type: 'json_schema' } });
  });

  it('dedupes concurrent requests for the same chunk', async () => {
    const { worlds, worldId, claude } = service([draft()]);
    const [a, b] = await Promise.all([worlds.request('s1', worldId, [{ cx: 1, cz: 0 }], false, quest), worlds.request('s2', worldId, [{ cx: 1, cz: 0 }], false, quest)]);
    expect(a.chunks[0]).toBe(b.chunks[0]);
    expect(claude.calls).toHaveLength(1);
  });

  it('rejects an unknown asset, retries once, then commits the seeded fallback', async () => {
    const { worlds, worldId, claude, logs } = service([draft('bld.invented')]);
    const { chunks } = await worlds.request('s1', worldId, [{ cx: 0, cz: 1 }], false, quest);
    expect(chunks[0]!.source).toBe('fallback');
    expect(claude.calls).toHaveLength(2);
    expect(logs.find((entry) => entry.source === 'fallback')!.errors).toEqual(expect.arrayContaining(['unknown asset bld.invented']));
  });

  it('falls back at the deadline when Claude hangs, and on refusal', async () => {
    const hung = service(['HANG']);
    const started = Date.now();
    expect((await hung.worlds.request('s1', hung.worldId, [{ cx: 5, cz: 5 }], false, quest)).chunks[0]!.source).toBe('fallback');
    expect(Date.now() - started).toBeLessThan(1_000);
    const refused = service(['REFUSAL']);
    expect((await refused.worlds.request('s1', refused.worldId, [{ cx: 5, cz: 5 }], false, quest)).chunks[0]!.source).toBe('fallback');
  });

  it('urgent requests commit a fallback immediately and the late Claude result is discarded', async () => {
    const { worlds, worldId } = service(['HANG'], { deadlineMs: 2_000 });
    const slow = worlds.request('s1', worldId, [{ cx: 2, cz: 2 }], false, quest);
    const urgent = await worlds.request('s1', worldId, [{ cx: 2, cz: 2 }], true, quest);
    expect(urgent.chunks[0]!.source).toBe('fallback');
    expect((await slow).chunks[0]).toBe(urgent.chunks[0]);
  });

  it('bounds Claude concurrency at two', async () => {
    const { worlds, worldId, claude } = service([draft()]);
    await worlds.request('s1', worldId, [0, 1, 2, 3, 4].map((cx) => ({ cx, cz: 9 })), false, quest);
    expect(claude.peak()).toBeLessThanOrEqual(2);
    expect(claude.calls).toHaveLength(5);
  });

  it('enforces the per-session call cap with the seeded generator', async () => {
    const { worlds, worldId, claude } = service([draft()], { sessionCallCap: 1 });
    const { chunks } = await worlds.request('s1', worldId, [{ cx: 7, cz: 0 }, { cx: 8, cz: 0 }], false, quest);
    expect(claude.calls).toHaveLength(1);
    expect(chunks.map((chunk) => chunk.source).sort()).toEqual(['claude', 'fallback']);
  });

  it('fixture sessions never call Claude', async () => {
    const { worlds, worldId, claude } = service([draft()]);
    expect((await worlds.request('s1', worldId, [{ cx: 0, cz: 0 }], false, quest, false)).chunks[0]!.source).toBe('fallback');
    expect(claude.calls).toHaveLength(0);
  });

  it('restores spawn into a fresh server with zero generation calls and identical terrain', async () => {
    const original = service([draft()]);
    const spawn = [-1, 0, 1].flatMap((cx) => [-1, 0, 1].map((cz) => ({ cx, cz })));
    const saved = (await original.worlds.request('s1', original.worldId, spawn.slice(0, 6), false, quest)).chunks
      .concat((await original.worlds.request('s1', original.worldId, spawn.slice(6), false, quest)).chunks);
    const restarted = service([draft()]);
    restarted.worlds.open(original.worldId);
    const restored = restarted.worlds.restore(original.worldId, saved);
    expect(restored.accepted).toHaveLength(9);
    const again = await restarted.worlds.request('s9', original.worldId, spawn.slice(0, 6), false, { missionId: 'Q3', weights });
    expect(again.chunks).toEqual(saved.slice(0, 6));
    expect(restarted.claude.calls).toHaveLength(0);
  });

  it('restore rejects tampered hashes, other worlds, old versions, and never overwrites a commit', async () => {
    const { worlds, worldId } = service([draft()]);
    const [chunk] = (await worlds.request('s1', worldId, [{ cx: 0, cz: 0 }], true, quest)).chunks as [ChunkManifest];
    const fresh = service([draft()]);
    fresh.worlds.open(worldId);
    const tampered = { ...chunk, placements: [{ ...chunk.placements[0]!, x: 30 }] };
    const response = fresh.worlds.restore(worldId, [tampered, { ...chunk, generatorVersion: 99 }]);
    expect(response.accepted).toEqual([]);
    expect(response.rejected.map((entry) => entry.reason)).toEqual([expect.stringContaining('hash'), expect.stringContaining('Incompatible')]);
    expect(worlds.restore(worldId, [{ ...chunk, contentHash: 'f'.repeat(64) }]).chunks[0]).toBe(chunk);
    fresh.worlds.open('other-world');
    expect(fresh.worlds.restore('other-world', [chunk]).rejected[0]!.reason).toContain('different world');
  });
});
