import { expect, test } from '@playwright/test';

test('implemented engine starts an authoritative production session', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('VibeQuest · Mandarin in motion');
  await expect(page.getByRole('heading', { name: 'Every street has a story.' })).toBeVisible();
  await expect(page.locator('[lang="zh-Hans"]', { hasText: '中文' })).toBeVisible();
  await expect(page.getByTestId('start-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByTestId('world-renderer')).toBeVisible();
  await expect(page.getByTestId('quest-panel')).toContainText('Café detour');
  await expect(page.getByText('Segment-000 scaffold', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
  const health = await page.request.get('/api/health');
  expect((await health.json()).segments.engine).toBe('implemented');
});
