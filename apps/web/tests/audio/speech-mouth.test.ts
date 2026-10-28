import { expect, it } from 'vitest';
import { mouthForLevel, rms } from '../../src/audio/speech-mouth';
import { isLaoWang, portraitEmotion } from '../../src/ui/NpcPortrait';

it('distinguishes actual silence, quiet speech and louder speech without reacting to signed PCM', () => {
  expect(mouthForLevel(rms(new Float32Array(1024)))).toBe('closed');
  expect(mouthForLevel(rms([.035, -.035]))).toBe('half-open');
  expect(mouthForLevel(rms([.15, -.15]))).toBe('open');
  expect(rms([])).toBe(0);
});
it('does not assign Lao Wang art to a different vendor identity or translate low clarity into anger', () => {
  expect(isLaoWang({ anchorId: 'a', role: 'vendor', name: '老王', nameKey: 'laowang' })).toBe(true);
  expect(isLaoWang({ anchorId: 'a', role: 'vendor', name: '老王', nameKey: 'laozhou' })).toBe(false);
  expect(isLaoWang({ anchorId: 'a', role: 'vendor', name: '小林' })).toBe(false);
  expect(portraitEmotion('warm')).toBe('happy');
  expect(portraitEmotion('neutral')).toBe('happy');
  expect(portraitEmotion('terse')).toBe('angry');
  expect(portraitEmotion('disengaged')).toBe('sad');
});
