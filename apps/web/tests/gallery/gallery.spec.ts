import { CITY_LIMITS } from '@vibequest/shared';
import { expect, test } from '../../../../tests/support/browser-test';

test.use({ renderProfile: 'full' });

// Runs in the WebGL-capable chromium-world project.
test('gallery lists ≥ 60 valid entries across every category and renders a 3×3 neighbourhood within budget', async ({ page }) => {
  await page.goto('/__gallery', { waitUntil: 'domcontentloaded' });
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
  const budget = page.getByTestId('gallery-budget');
  // Only districts the planner still emits (planner.ts LAND_KINDS + the river banks) have a 3×3 sample.
  for (const district of ['shopping', 'park', 'waterfront']) {
    await page.getByTestId('gallery-district').selectOption(district);
    await expect(page.getByTestId('gallery-neighbourhood')).toHaveAttribute('data-district', district);
    await expect(page.getByTestId('gallery-neighbourhood')).toHaveAttribute('data-chunks', '9');
    // Once the new district has committed, discard its old sample and wait for a fresh rendered measurement.
    await budget.evaluate((node) => { delete node.dataset.drawCalls; delete node.dataset.triangles; delete node.dataset.withinBudget; });
    await expect(budget).toHaveAttribute('data-draw-calls', /^[1-9]\d*$/, { timeout: 5_000 });
    expect(Number(await budget.getAttribute('data-draw-calls')), `${district} draw calls`).toBeLessThanOrEqual(CITY_LIMITS.maxDrawCalls);
    expect(Number(await budget.getAttribute('data-triangles')), `${district} triangles`).toBeLessThanOrEqual(CITY_LIMITS.maxTriangles);
  }
});
