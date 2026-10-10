import { expect, test } from '@playwright/test';

// Preserve the bootstrap presentation regression as an explicit health fixture.
test.describe('bootstrap presentation fixtures', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill({ json: {
      status: 'ok', buildId: 'segment-000', specVersion: '1.2',
      providers: { geminiConfigured: false, elevenlabsConfigured: false },
      features: { fixtures: false, validationHarness: false },
      segments: { engine: 'unimplemented', dialogue: 'unimplemented', speech: 'unimplemented' },
    } }));
  });

test('production shell shares a Chinese world and explicit unimplemented voice slots', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('VibeQuest · Mandarin in motion');
  await expect(page.getByRole('heading', { name: 'Every street has a story.' })).toBeVisible();
  await expect(page.getByText('Segment-000 scaffold', { exact: true })).toBeVisible();
  await expect(page.getByText('请从广场进入。这扇门关闭了。', { exact: true })).toBeVisible();
  await expect(page.locator('[lang="zh-Hans"]', { hasText: '中文' })).toBeVisible();
  await expect(page.getByTestId('world-renderer')).toBeVisible();
  await expect(page.getByTestId('fixture-state')).toContainText('XP 0');
  await expect(page.getByTestId('recorder-stub')).toContainText('Unimplemented · Segment-005');
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeDisabled();
  await expect(page.getByTestId('audio-controller-stub')).toContainText('Unimplemented · Segment-005');
  await expect(page.getByTestId('skill-debrief-stub')).toContainText('Unimplemented · Segment-006');
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /validation|text mode/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /validation|text mode/i })).toHaveCount(0);
  await expect(page.getByTestId('api-health')).toContainText('API connected');
  await expect(page.getByTestId('api-health')).toContainText('segment-000');
  await expect(page.getByTestId('api-health')).toContainText('Gemini');
  await expect(page.getByTestId('api-health')).toContainText('ElevenLabs');
  await expect(page.getByTestId('api-health')).toContainText('unimplemented');
});

test('API configured flags are visible without claiming a live call', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({
    json: {
      status: 'ok', buildId: 'segment-000', specVersion: '1.2',
      providers: { geminiConfigured: true, elevenlabsConfigured: false },
      features: { fixtures: false, validationHarness: false },
      segments: { engine: 'unimplemented', dialogue: 'unimplemented', speech: 'unimplemented' },
    },
  }));
  await page.goto('/');
  const health = page.getByTestId('api-health');
  await expect(health.locator('dl > div').filter({ hasText: 'Gemini' })).toContainText('Configured');
  await expect(health.locator('dl > div').filter({ hasText: 'ElevenLabs' })).toContainText('Missing');
  await expect(health).toContainText('No live provider call has been verified');
});

test('bootstrap preview checks the implemented session API without advancing progress', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Check session seam' }).click();
  await expect(page.getByTestId('session-notice')).toContainText('The session endpoint responded.');
  await expect(page.getByTestId('fixture-state')).toContainText('XP 0');
  await expect(page.getByTestId('fixture-state')).toContainText('active');
});

test('unavailable WebGL offers compatibility recovery inside the same shell', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof originalGetContext>) {
      if (typeof args[0] === 'string' && args[0].startsWith('webgl')) return null;
      return originalGetContext.apply(this, args);
    } as typeof originalGetContext;
  });
  await page.goto('/');
  await expect(page.getByTestId('webgl-recovery')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The district needs WebGL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload preview' })).toBeVisible();
  await expect(page.getByTestId('webgl-recovery')).toContainText('does not start a game');
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
  await expect(page.getByTestId('recorder-stub')).toBeVisible();
});

});

test('implemented engine starts an authoritative production session', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('start-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Start Practice' }).click();
  await expect(page.getByTestId('world-renderer')).toBeVisible();
  await expect(page.locator('.session-footer')).toContainText('Version 0');
  await expect(page.getByText('Segment-000 scaffold', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
  const health = await page.request.get('/api/health');
  expect((await health.json()).segments.engine).toBe('implemented');
});
