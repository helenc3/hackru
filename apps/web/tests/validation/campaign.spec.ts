import { test, expect } from './dev-page';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';
import { drinkSteps, hotelSteps, missionPatch, photoSteps } from '../../../../fixtures/validation/campaigns';
import type { Page } from '@playwright/test';

const target = (page: Page, name: string) => page.getByTestId('validation-harness').getByRole('button', { name, exact: true });
async function open(page: Page, npc: string) {
  await target(page, npc).click();
  const panel = page.getByTestId('dialogue-panel');
  await expect(panel).toBeVisible();
  if (await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).count()) await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  return panel;
}
async function say(page: Page, text: string) {
  const panel = page.getByTestId('dialogue-panel');
  await panel.getByRole('textbox').fill(text);
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  // A quest-completing turn replaces the dialogue with the result panel.
  await expect.poll(async () => await page.getByTestId('result-panel').isVisible() || await panel.getByRole('textbox').inputValue().catch(() => 'pending') === '').toBe(true);
}
async function drink(page: Page) {
  await target(page, 'sign · ui.menu').click();
  await expect(page.getByRole('dialog', { name: 'Inspected sign' })).toContainText('咖啡 卖完了');
  await page.getByRole('button', { name: 'Close sign' }).click();
  await open(page, 'npc/vendor · ui.vendor');
  await say(page, '我要咖啡。'); await say(page, '那我要水，五元，对吗？');
  await page.getByTestId('pay-button').click();
  await expect(page.getByTestId('result-panel')).toContainText('Nicely done.');
}
async function hotel(page: Page) {
  await open(page, 'npc/guide · ui.guide');
  await say(page, '请问，去上海大酒店怎么走？');
  await expect(page.getByTestId('result-panel')).toContainText('Nicely done.');
}
async function photograph(page: Page) {
  await open(page, 'npc/passerby · ui.passerby');
  await say(page, '可以帮我在这里拍张照吗？');
  await page.getByTestId('dialogue-panel').getByRole('button', { name: 'Close conversation' }).click();
  await page.getByTestId('photo-overlay').getByRole('button', { name: 'Ready · start photo' }).click();
  await expect(page.getByTestId('result-panel')).toContainText('Nicely done.');
}

test('one validation session completes all three quests through the shared API, simulated only', async ({ page, devUrl }) => {
  const api = await installScriptedApi(page, { validation: true, steps: [
    ...drinkSteps(), { action: { type: 'startMission', missionId: 'Q2' }, patch: missionPatch('Q2', 100, { completedMissionIds: ['Q1'], unlockedMissionIds: ['Q1', 'Q2'] }) },
    ...hotelSteps(), { action: { type: 'startMission', missionId: 'Q3' }, patch: missionPatch('Q3', 200, { completedMissionIds: ['Q1', 'Q2'], unlockedMissionIds: ['Q1', 'Q2', 'Q3'] }) },
    ...photoSteps(),
  ] });
  await page.goto(`${devUrl}/__validation`); await page.getByRole('button', { name: 'Start validation session' }).click();
  await drink(page); await page.getByRole('button', { name: 'Next quest' }).click();
  await hotel(page); await page.getByRole('button', { name: 'Next quest' }).click();
  await photograph(page);
  await expect(page.getByTestId('result-panel')).toContainText('SIMULATED RESULT');
  await expect(page.getByTestId('result-panel')).toContainText('Simulated badge: Shanghai Explorer');
  expect(api.remaining()).toBe(0); expect(api.failures).toEqual([]);
  expect(api.requests.filter((request) => request.path.endsWith('/turns'))).toHaveLength(4);
  expect(await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'))).toBeNull();
  // Validation sessions never claim the player's saved city.
  expect(await page.evaluate(() => localStorage.getItem('vibequest.worldId'))).toBeNull();
  await expect(page.getByTestId('inventory-bar')).toContainText('Simulated XP');
});

test('validation entry needs server permission and cannot resume a player session', async ({ page, devUrl }) => {
  await installScriptedApi(page, { validation: false });
  await page.goto(`${devUrl}/__validation`);
  await expect(page.getByRole('heading', { name: 'Internal validation is unavailable.' })).toBeVisible();
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
});

test('rapid developer relocations dispatch serially with fresh versions', async ({ page, devUrl }) => {
  const api = await installScriptedApi(page, { validation: true });
  await page.goto(`${devUrl}/__validation`); await page.getByRole('button', { name: 'Start validation session' }).click();
  await expect(page.getByTestId('validation-harness')).toBeVisible();
  await page.getByTestId('validation-harness').evaluate((panel) => {
    const button = [...panel.querySelectorAll('button')].find((entry) => entry.textContent === 'sign · ui.menu')!;
    button.click(); button.click();
  });
  await expect.poll(() => api.requests.filter((request) => request.path.endsWith('/actions')).length).toBeGreaterThanOrEqual(2);
  const versions = api.requests.filter((request) => request.path.endsWith('/actions')).map((request) => (request.body as { expectedVersion: number }).expectedVersion);
  expect(versions).toEqual([...versions].sort((a, b) => a - b));
});
