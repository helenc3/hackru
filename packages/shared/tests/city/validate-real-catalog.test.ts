import { describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_VERSION, resolveParams } from '../../src/city/catalog/index.js';
import { sealManifest } from '../../src/city/hash.js';
import { deriveCollision, validateManifest } from '../../src/city/validate.js';
import { manifest, plan } from './fake-city.js';

// Integration with the real catalog: every approved ground building validates alone in an empty
// lot north of the street, and its derived collision matches its catalog footprint.
describe('validator × real catalog', () => {
  const p = plan();
  const lots = CATALOG.filter((e) => e.review === 'approved' && e.placement === 'ground' && e.category === 'building');
  it.each(lots.map((e) => [e.id, e]))('%s', (_id, entry) => {
    const size = entry.footprint(resolveParams(entry));
    if (size.d > 14 || size.w > 38) return; // too big for the test lot; covered by planner/fallback tests
    const m = sealManifest({ ...manifest(p, { placements: [{ id: 'lot', assetId: entry.id, params: {}, x: 20, z: 14 - size.d / 2, rotation: 0 }] }), catalogVersion: CATALOG_VERSION });
    expect(validateManifest(m, p)).toEqual({ ok: true });
    for (const solid of deriveCollision(m).solids) { expect(solid.maxZ).toBeLessThanOrEqual(15 + 1e-6); expect(solid.minX).toBeGreaterThanOrEqual(20 - size.w / 2 - 1e-6); }
  });
});
