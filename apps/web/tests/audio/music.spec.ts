import { test, expect } from '../../../../tests/support/browser-test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';

test('journey music fades in, ducks throughout conversation, restores and mutes', async ({ page }) => {
  await page.addInitScript(() => {
    const levels: { value: number; seconds: number }[] = [];
    (window as unknown as { musicLevels: typeof levels }).musicLevels = levels;
    const original = AudioContext.prototype.createGain;
    const seen = new WeakSet<AudioContext>();
    AudioContext.prototype.createGain = function () {
      const node = original.call(this);
      if (!seen.has(this)) {
        seen.add(this);
        const ramp = node.gain.linearRampToValueAtTime.bind(node.gain);
        node.gain.linearRampToValueAtTime = (value, time) => {
          levels.push({ value, seconds: time - this.currentTime });
          return ramp(value, time);
        };
      }
      return node;
    };
  });
  await installScriptedApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  const levels = () => page.evaluate(() => (window as unknown as { musicLevels: { value: number; seconds: number }[] }).musicLevels);
  // Unlock with a gesture that remains valid if the async label changes meanwhile.
  await page.keyboard.press('Shift');
  await expect(page.getByRole('button', { name: 'Mute music', exact: true })).toBeVisible();
  await expect.poll(async () => (await levels())[0]?.value).toBe(.24);
  expect((await levels())[0].seconds).toBeCloseTo(8, 1);
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  await expect.poll(async () => (await levels()).at(-1)?.value).toBe(.045);
  await page.getByRole('button', { name: 'Close conversation', exact: true }).click();
  await expect.poll(async () => (await levels()).at(-1)?.value).toBe(.24);
  await page.getByRole('button', { name: 'Mute music', exact: true }).click();
  await expect.poll(async () => (await levels()).at(-1)?.value).toBe(0);
});
