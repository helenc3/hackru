import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cues } from '@vibequest/shared';
import manifest from '../../../../fixtures/audio/pa-manifest.json' with { type: 'json' };

const audioDir = fileURLToPath(new URL('../../../web/public/audio/', import.meta.url));

describe('generated PA assets', () => {
  const variants = cues.flatMap((cue) => cue.variants.filter((variant) => variant.audioAssetId).map((variant) => ({ cue, variant })));

  it('cover every cue variant audio asset with current text', () => {
    expect(variants.length).toBeGreaterThan(0);
    for (const { cue, variant } of variants) {
      const entry = manifest.find((item) => item.audioAssetId === variant.audioAssetId);
      expect(entry, variant.audioAssetId).toBeDefined();
      expect(entry).toMatchObject({ cueId: cue.id, tier: variant.tier, textZh: variant.textZh });
    }
  });

  it('ship non-empty mp3 files matching the manifest hash', () => {
    for (const entry of manifest) {
      const file = `${audioDir}${entry.audioAssetId}.mp3`;
      expect(existsSync(file), file).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.length).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      expect(entry.textZh).not.toMatch(/[0-9]/);
    }
  });
});
