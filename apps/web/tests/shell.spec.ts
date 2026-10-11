import { expect, test } from '@playwright/test';

test('implemented engine starts an authoritative production session', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Speak Your Way · Mandarin in motion');
  await expect(page.getByTestId('start-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await expect(page.getByTestId('world-renderer')).toBeVisible();
  // The topbar no longer shows the session version; confirm the authoritative session through the API instead.
  const sessionId = await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'));
  expect(sessionId).toBeTruthy();
  const { state } = await (await page.request.get(`/api/sessions/${sessionId}`)).json();
  expect(state.missionId).toBe('Q1');
  // The city is persistent: the session's world is remembered for the next visit.
  expect(await page.evaluate(() => localStorage.getItem('vibequest.worldId'))).toBe(state.worldId);
  await expect(page.getByText('Segment-000 scaffold', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
  const health = await page.request.get('/api/health');
  expect((await health.json()).segments.engine).toBe('implemented');
});
