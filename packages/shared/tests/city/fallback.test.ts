import { describe, expect, it } from 'vitest';
import { catalogEntry, resolveParams, CATALOG } from '../../src/city/catalog/index.js';
import { inSpawnBox, type QuestContextSnapshot } from '../../src/city/contracts.js';
import { generateFallbackChunk } from '../../src/city/fallback.js';
import { sealManifest, verifyManifestHash } from '../../src/city/hash.js';
import { planChunk, worldLayout } from '../../src/city/planner.js';
import { createRng, seedFromWorldId } from '../../src/city/rng.js';
import { npcIdentity } from '../../src/city/npc-identity.js';
import { overlaps, repairManifest, rotateRect, validateManifest } from '../../src/city/validate.js';

const context = (boost = 1): QuestContextSnapshot => ({ missionId: 'Q1', weights: { 'drink-vendor': boost, 'direction-helper': 1, 'hotel-landmark': 1, 'river-viewpoint': 1, 'photo-passerby': 1 } });
const worlds = ['w-alpha', 'w-beta', 'w-gamma', 'w-delta'];

describe('seeded fallback chunks', () => {
  it('gives 老王 a visible serving stand in the reported world', () => {
    const worldId = 'wacdf281718b44f01', seed = seedFromWorldId(worldId);
    expect(seed).toBe('1ac08beb7e09dee1');
    const manifest = generateFallbackChunk(worldId, seed, { cx: 0, cz: 0 }, context());
    const anchor = manifest.anchors.find((a) => a.nameKey === 'laowang')!;
    const stand = manifest.placements.find((p) => p.id === anchor.placementId)!;
    expect(['an.vendor.drink-stall', 'an.vendor.cafe-counter']).toContain(stand.assetId);
    const vendor = manifest.placements.find((p) => p.assetId === 'an.npc.vendor' && p.attachTo?.placementId === stand.id)!;
    expect(vendor).toBeDefined();
    expect(vendor.params.nameKey).toBe('laowang');
    expect(validateManifest(manifest, planChunk(seed, { cx: 0, cz: 0 })).ok).toBe(true);
  });

  it('rejects attachment coordinates that disagree with the rendered stand socket', () => {
    const worldId = 'w-alpha', seed = seedFromWorldId(worldId), coord = { cx: 0, cz: 0 };
    const plan = planChunk(seed, coord), manifest = generateFallbackChunk(worldId, seed, coord, context(), plan);
    const vendor = manifest.placements.find((p) => p.assetId === 'an.npc.vendor')!;
    const broken = sealManifest({ ...manifest, placements: manifest.placements.map((p) => p.id === vendor.id ? { ...p, x: p.x + 2 } : p) });
    const result = validateManifest(broken, plan);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('attachment pose differs from its rendered socket');
    // Repair must not "fix" a required stand by removing its character.
    expect(repairManifest(broken, plan)).toBeNull();
  });

  it('rejects a vendor attached to an info board rather than a drink stand', () => {
    const worldId = 'w-alpha', seed = seedFromWorldId(worldId), coord = { cx: 0, cz: 0 };
    const plan = planChunk(seed, coord), manifest = generateFallbackChunk(worldId, seed, coord, context(), plan);
    const vendor = manifest.placements.find((p) => p.assetId === 'an.npc.vendor')!;
    const broken = sealManifest({ ...manifest, placements: manifest.placements.map((p) =>
      p.id === vendor.attachTo!.placementId ? { ...p, assetId: 'an.helper.info-board', params: { style: 'map' } } : p) });
    const result = validateManifest(broken, plan);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('vendor character requires a drink stand or shop parent');
  });

  it('preserves complete vendor assemblies and valid terrain across 100 world seeds', () => {
    const failures: string[] = [];
    const stands = new Set<string>();
    const genders = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const worldId = `w-placement-regression-${i}`, seed = seedFromWorldId(worldId);
      const coords = [{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, worldLayout(seed).hotel.coord,
        { cx: 3, cz: 0 }, { cx: 4, cz: 0 }, { cx: -2, cz: -1 }, { cx: 2, cz: 2 },
        ...worldLayout(seed).creekRows.map((cz) => ({ cx: 3, cz }))];
      for (const coord of coords) {
        const plan = planChunk(seed, coord);
        const manifest = generateFallbackChunk(worldId, seed, coord, context(1.5), plan);
        const result = validateManifest(manifest, plan);
        if (!result.ok) failures.push(`${worldId} ${coord.cx},${coord.cz}: ${result.errors.join('; ')}`);
        for (const anchor of manifest.anchors.filter((a) => a.kind === 'npc')) {
          const identity = npcIdentity(anchor.nameKey);
          expect(identity, `${worldId}: unknown NPC identity`).toBeDefined();
          genders.add(identity!.gender);
        }
        for (const figure of manifest.placements.filter((p) => p.assetId === 'an.npc.vendor')) {
          const parent = manifest.placements.find((p) => p.id === figure.attachTo?.placementId);
          expect(parent, `${worldId}: vendor without stand`).toBeDefined();
          expect(parent!.assetId).toMatch(/^an\.vendor\./);
          stands.add(parent!.assetId);
          expect(manifest.anchors.some((a) => a.role === 'vendor' && a.placementId === parent!.id)).toBe(true);
        }
        for (const parent of manifest.placements.filter((p) => p.assetId.startsWith('an.vendor.'))) {
          expect(manifest.placements.filter((p) => p.assetId === 'an.npc.vendor' && p.attachTo?.placementId === parent.id)).toHaveLength(1);
        }
      }
    }
    expect(failures).toEqual([]);
    expect([...genders].sort()).toEqual(['female', 'male']);
    expect([...stands].sort()).toEqual(['an.vendor.cafe-counter', 'an.vendor.drink-stall']);
  }, 30_000);

  it('keeps the convenience vendor outside the solid shop shell', () => {
    const entry = catalogEntry('an.vendor.convenience')!;
    const params = resolveParams(entry, {});
    const socket = entry.sockets(params).find((s) => s.kind === 'npc')!;
    const figure = catalogEntry('an.npc.vendor')!.footprint({});
    for (const wall of entry.collision(params).solids) {
      const overlaps = socket.x - figure.w / 2 < wall.maxX && socket.x + figure.w / 2 > wall.minX
        && socket.z - figure.d / 2 < wall.maxZ && socket.z + figure.d / 2 > wall.minZ;
      expect(overlaps).toBe(false);
    }
  });

  it('rejects a guide interaction bound to an info board without a character', () => {
    const worldId = 'w-alpha', seed = seedFromWorldId(worldId), coord = { cx: 1, cz: 0 };
    const plan = planChunk(seed, coord);
    const manifest = generateFallbackChunk(worldId, seed, coord, context(), plan);
    const guide = manifest.anchors.find((a) => a.role === 'guide')!;
    const broken = sealManifest({ ...manifest, placements: manifest.placements.map((p) =>
      p.id === guide.placementId ? { ...p, assetId: 'an.helper.info-board', params: { style: 'map' } } : p) });
    const result = validateManifest(broken, plan);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('info board NPC anchor requires an attached guide character');
  });

  it('gives every NPC interaction a character placement across seeds', () => {
    for (const worldId of worlds) {
      const seed = seedFromWorldId(worldId);
      for (let cx = -2; cx <= 5; cx++) for (let cz = -2; cz <= 2; cz++) {
        const manifest = generateFallbackChunk(worldId, seed, { cx, cz }, context());
        for (const anchor of manifest.anchors.filter((a) => a.kind === 'npc')) {
          const bound = manifest.placements.find((p) => p.id === anchor.placementId)!;
          const figure = bound.assetId === `an.npc.${anchor.role}` ? bound : manifest.placements.find((p) =>
            p.attachTo?.placementId === bound.id && p.assetId === `an.npc.${anchor.role}`);
          expect(figure, `${worldId} ${cx},${cz} ${anchor.id} (${bound.assetId})`).toBeDefined();
          const size = catalogEntry(figure!.assetId)!.footprint(resolveParams(catalogEntry(figure!.assetId)!, figure!.params));
          const local = rotateRect({ minX: -size.w / 2, maxX: size.w / 2, minZ: -size.d / 2, maxZ: size.d / 2 }, figure!.rotation);
          const body = { minX: local.minX + figure!.x, maxX: local.maxX + figure!.x, minZ: local.minZ + figure!.z, maxZ: local.maxZ + figure!.z };
          for (const other of manifest.placements) {
            if (other.id === figure!.id || other.id === figure!.attachTo?.placementId) continue;
            const entry = catalogEntry(other.assetId)!;
            for (const solid of entry.collision(resolveParams(entry, other.params)).solids) {
              const r = rotateRect(solid, other.rotation);
              const world = { minX: r.minX + other.x, maxX: r.maxX + other.x, minZ: r.minZ + other.z, maxZ: r.maxZ + other.z };
              expect(overlaps(body, world), `${worldId} ${cx},${cz}: ${other.assetId} overlaps ${anchor.id}`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('validate for ~200 random chunks across seeds, including spawn, hotel and river chunks', () => {
    const failures: string[] = [];
    let count = 0;
    for (const worldId of worlds) {
      const seed = seedFromWorldId(worldId), rng = createRng(seed, 'test');
      const hotel = worldLayout(seed).hotel.coord;
      const coords = [hotel, { cx: 3, cz: 0 }, { cx: 4, cz: 0 }, ...worldLayout(seed).creekRows.map((cz) => ({ cx: 3, cz })), ...worldLayout(seed).creekRows.map((cz) => ({ cx: -1, cz }))];
      for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) coords.push({ cx, cz });
      while (coords.length < 50) coords.push({ cx: Math.floor(rng() * 24) - 12, cz: Math.floor(rng() * 24) - 12 });
      for (const coord of coords) {
        const plan = planChunk(seed, coord);
        const manifest = generateFallbackChunk(worldId, seed, coord, context(), plan);
        count++;
        const result = validateManifest(manifest, plan);
        if (!result.ok) failures.push(`${worldId} ${coord.cx},${coord.cz}: ${result.errors.slice(0, 3).join('; ')}`);
      }
    }
    expect(count).toBeGreaterThanOrEqual(200);
    expect(failures).toEqual([]);
  });

  it('fills urban blocks with mostly tall buildings and reserves ground greenery for parks', () => {
    let buildings = 0, tall = 0;
    for (const worldId of worlds) {
      const seed = seedFromWorldId(worldId);
      for (let cx = -1; cx <= 5; cx++) for (let cz = -1; cz <= 1; cz++) {
        const manifest = generateFallbackChunk(worldId, seed, { cx, cz }, context());
        if (manifest.district === 'park') continue;
        const shells = manifest.placements.filter((p) => p.assetId.startsWith('bld.') || p.assetId === 'an.hotel.grand');
        if (manifest.water.length === 0) expect(shells.length).toBeGreaterThan(0);
        for (const p of shells) {
          const entry = catalogEntry(p.assetId)!;
          buildings++;
          if (entry.footprint(resolveParams(entry, p.params)).h >= 12) tall++;
        }
        expect(manifest.placements.filter((p) => p.assetId.startsWith('ls.') && catalogEntry(p.assetId)!.placement === 'ground')).toEqual([]);
      }
    }
    expect(tall / buildings).toBeGreaterThan(0.5);
  });

  it('is deterministic and sealed', () => {
    const seed = seedFromWorldId('w-alpha');
    const a = generateFallbackChunk('w-alpha', seed, { cx: 0, cz: 0 }, context());
    const b = generateFallbackChunk('w-alpha', seed, { cx: 0, cz: 0 }, context());
    expect(a).toEqual(b);
    expect(verifyManifestHash(a)).toBe(true);
    expect(a.source).toBe('fallback');
  });

  it('uses only approved catalog assets and places every required anchor', () => {
    const ids = new Set(CATALOG.filter((e) => e.review === 'approved').map((e) => e.id));
    for (const worldId of worlds) {
      const seed = seedFromWorldId(worldId);
      for (const coord of [{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, worldLayout(seed).hotel.coord, { cx: 3, cz: 0 }, { cx: 3, cz: 3 }]) {
        const plan = planChunk(seed, coord);
        const m = generateFallbackChunk(worldId, seed, coord, context(), plan);
        expect(m.placements.every((p) => ids.has(p.assetId))).toBe(true);
        for (const required of plan.requiredAnchors) expect(m.anchors.map((a) => a.id), `${worldId} ${coord.cx},${coord.cz}`).toContain(required.anchorId);
        if (inSpawnBox(coord) && coord.cx === 0 && coord.cz === 0) expect(m.anchors.find((a) => a.capability === 'drink-vendor')?.nameKey).toBe('laowang');
      }
    }
  });

  it('places the hotel only in its reserved chunk and keeps anchor IDs globally unique', () => {
    const seed = seedFromWorldId('w-beta');
    const seen = new Set<string>();
    for (let cx = -3; cx <= 4; cx++) for (let cz = -3; cz <= 3; cz++) {
      const m = generateFallbackChunk('w-beta', seed, { cx, cz }, context());
      const hotel = m.placements.some((p) => p.assetId === 'an.hotel.grand');
      expect(hotel).toBe(cx === worldLayout(seed).hotel.coord.cx && cz === worldLayout(seed).hotel.coord.cz);
      for (const a of m.anchors) { expect(seen.has(a.id), a.id).toBe(false); seen.add(a.id); }
    }
  });

  it('raises optional vendor frequency when the quest weight is boosted', () => {
    const seed = seedFromWorldId('w-gamma');
    const vendors = (boost: number) => {
      let n = 0;
      for (let cx = -10; cx <= 2; cx++) for (let cz = -8; cz <= 8; cz++) if (!inSpawnBox({ cx, cz })) n += generateFallbackChunk('w-gamma', seed, { cx, cz }, context(boost)).anchors.filter((a) => a.capability === 'drink-vendor').length;
      return n;
    };
    expect(vendors(1.5)).toBeGreaterThan(vendors(1));
  });
});
