import { expect, test } from '../../../../tests/support/browser-test';

// The welcome preview renders the seeded spawn box (fallback chunks), so the quest givers must be standing there.
test('the seeded spawn box shows 老王 in view and 小李 on the avenue east of spawn', async ({ page }) => {
  await page.goto('/');
  const preview = page.getByTestId('world-preview');
  await expect(preview).toBeVisible();
  const label = (name: string) => preview.locator('.district-landmark', { hasText: name });
  await expect(label('老王')).toHaveCount(1);
  await expect(label('老王')).toHaveCSS('display', 'block'); // projected on screen next to the spawn
  await expect(label('小李')).toHaveCount(1);
});
