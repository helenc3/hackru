import { expect, test } from '../../../../tests/support/browser-test';

test.use({ renderProfile: 'full' });

// Runs in the WebGL-capable chromium-world project.
test('gallery lists ≥ 60 valid entries across every category and renders a 3×3 neighbourhood within budget', async ({ page }) => {
  await page.goto('/__gallery');
  const summary = page.getByTestId('gallery-summary');
  await expect(summary).toHaveAttribute('data-ok', 'true');
  expect(Number(await summary.getAttribute('data-total'))).toBeGreaterThanOrEqual(60);
  for (const category of ['building', 'storefront', 'street', 'landscape', 'waterfront', 'anchor']) {
    const tab = page.getByTestId(`gallery-tab-${category}`);
    expect(Number(await tab.getAttribute('data-count'))).toBeGreaterThan(0);
    await tab.click();
    const entries = page.getByTestId('gallery-entry');
    await expect(entries.first()).toBeVisible();
    await expect(page.locator('[data-testid=gallery-entry][data-valid=false]')).toHaveCount(0);
    await expect(page.locator('[data-testid=gallery-variant]:not([data-status=ok])')).toHaveCount(0);
  }
  for (const district of ['shopping', 'historic', 'residential', 'waterfront']) {
    await page.getByTestId('gallery-district').selectOption(district);
    await expect(page.getByTestId('gallery-neighbourhood')).toHaveAttribute('data-chunks', '9');
    await expect(page.getByTestId('gallery-budget')).toHaveAttribute('data-within-budget', 'true', { timeout: 15_000 });
  }
});
