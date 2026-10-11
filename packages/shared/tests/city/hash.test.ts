import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sealManifest, sha256Hex, verifyManifestHash } from '../../src/city/hash.js';

describe('city hash', () => {
  it('matches node sha256 across padding boundaries and UTF-8', () => {
    for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), '上海大酒店'.repeat(30)]) expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
  });
  it('canonical JSON ignores key order and undefined', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe(canonicalJson({ a: [{ d: 2 }], b: 1 }));
  });
  it('seals and detects tampering', () => {
    const sealed = sealManifest({ worldId: 'w', placements: [] } as never);
    expect(verifyManifestHash(sealed)).toBe(true);
    expect(verifyManifestHash({ ...sealed, worldId: 'x' })).toBe(false);
    expect(sealManifest(sealed).contentHash).toBe(sealed.contentHash);
  });
});
