import { test, expect } from './dev-page';
import { installScriptedApi, type Step } from '../../../../fixtures/ui/scripted-api';
import { bossSteps, cafeSteps, missionPatch, platformSteps } from '../../../../fixtures/validation/campaigns';
import type { Page } from '@playwright/test';

const target = (page: Page, name: string) => page.getByTestId('validation-harness').getByRole('button', { name, exact: true });
async function talk(page: Page, npc: string, text: string) {
  await target(page, `npc · ${npc}`).click();
  const panel = page.getByTestId('dialogue-panel');
  await expect(panel).toBeVisible();
  if (await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).count()) await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await panel.getByRole('textbox').fill(text);
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByRole('textbox')).toHaveValue('');
  await panel.getByRole('button', { name: 'Close conversation' }).click();
}
async function cafe(page: Page, kiosk = false) {
  await target(page, 'sign · p1.entrance-sign').click();
  await expect(page.getByRole('dialog', { name: 'Inspected sign' })).toContainText('请从广场进入');
  await page.keyboard.press('Escape');
  await talk(page, 'xiaolin', '我要咖啡。');
  if (kiosk) { await talk(page, 'xiaolin', '不用了，谢谢。'); await talk(page, 'xiaolin', '我要水，五元，对吗？'); await target(page, 'choice · p1.go-kiosk').click(); }
  else await talk(page, 'xiaolin', '那我要水，五元，对吗？');
  await target(page, `choice · p1.pay-${kiosk ? 'kiosk' : 'cafe'}`).click();
  await expect(page.getByTestId('result-panel')).toHaveCount(0);
  await target(page, 'concourse').click();
  await expect(page.getByTestId('result-panel')).toContainText('You found your way.');
}
async function platform(page: Page, confirmation = false, wrong = false) {
  await target(page, 'sign · p2.timetable').click();
  await page.keyboard.press('Escape');
  await talk(page, 'achen', '去江滨的车在哪个站台？');
  await target(page, 'pa · p2.platform-change').click();
  if (confirmation) await talk(page, 'achen', '是三号站台吗？');
  if (wrong) { await target(page, 'choice · p2.board-2').click(); await expect(page.getByTestId('result-panel')).toHaveCount(0); }
  await target(page, 'choice · p2.board-3').click();
  await expect(page.getByTestId('result-panel')).toContainText('You found your way.');
}
async function boss(page: Page, fail = false) {
  await target(page, 'sign · b1.destination-board').click();
  await page.keyboard.press('Escape');
  await talk(page, 'laozhou', '我要一张去海港的票。');
  await expect(page.getByTestId('coach-panel')).toHaveCount(0);
  await expect(page.getByTestId('inventory-bar').getByRole('button')).toHaveCount(0);
  await target(page, 'choice · b1.pay-ticket').click();
  await target(page, 'pa · b1.harbor-change').click();
  await target(page, `choice · b1.board-${fail ? '1' : '2'}`).click();
  await expect(page.getByTestId('result-panel')).toContainText(fail ? 'Try a fresh route.' : 'You found your way.');
}

for (const kiosk of [false, true]) test(`validation café ${kiosk ? 'kiosk' : 'substitution'} branch stays simulated`, async ({ page, devUrl }) => {
  const api = await installScriptedApi(page, { validation: true, steps: cafeSteps(kiosk) });
  await page.goto(`${devUrl}/__validation`);
  await page.getByRole('button', { name: 'Start validation session' }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await cafe(page, kiosk);
  await expect(page.getByTestId('result-panel')).toContainText('SIMULATED RESULT');
  expect(api.remaining()).toBe(0); expect(api.failures).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'))).toBeNull();
});
for (const confirmation of [false, true]) test(`validation platform ${confirmation ? 'confirmation' : 'direct'} route repairs wrong boarding`, async ({ page, devUrl }) => {
  const api = await installScriptedApi(page, { mission: 'P2', validation: true, steps: platformSteps(confirmation, true) });
  await page.goto(`${devUrl}/__validation`); await page.getByRole('button', { name: 'Start validation session' }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await platform(page, confirmation, true);
  expect(api.remaining()).toBe(0); expect(api.failures).toEqual([]);
});
for (const fail of [false, true]) test(`validation boss ${fail ? 'fails and retries' : 'clears without help'}`, async ({ page, devUrl }) => {
  const steps: Step[] = [...bossSteps(fail), ...(fail ? [{ action: { type: 'retryMission' as const }, patch: { ...missionPatch('B1', 180), sessionId: 'ui-validation-B1', badges: [] } }] : [])];
  const api = await installScriptedApi(page, { mission: 'B1', validation: true, steps });
  await page.goto(`${devUrl}/__validation`); await page.getByRole('button', { name: 'Start validation session' }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await boss(page, fail);
  if (fail) { await expect(page.getByTestId('result-panel')).not.toContainText('Station Navigator'); await page.getByRole('button', { name: 'Retry mission' }).click(); await expect(page.getByTestId('result-panel')).toHaveCount(0); }
  else await expect(page.getByTestId('result-panel')).toContainText('Simulated badge: Station Navigator');
  expect(api.remaining()).toBe(0); expect(api.failures).toEqual([]);
});
test('one validation session completes all three missions through the shared API', async ({ page, devUrl }) => {
  const api = await installScriptedApi(page, { validation: true, steps: [
    ...cafeSteps(), { action: { type: 'startMission', missionId: 'P2' }, patch: missionPatch('P2', 80) },
    ...platformSteps(), { action: { type: 'startMission', missionId: 'B1' }, patch: missionPatch('B1', 180) }, ...bossSteps(),
  ] });
  await page.goto(`${devUrl}/__validation`); await page.getByRole('button', { name: 'Start validation session' }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await cafe(page); await page.getByRole('button', { name: 'Next practice mission' }).click();
  await platform(page); await page.getByRole('button', { name: 'Enter boss mission' }).click(); await boss(page);
  expect(api.remaining()).toBe(0); expect(api.failures).toEqual([]);
  expect(api.requests.filter((request) => request.path.endsWith('/turns'))).toHaveLength(4);
  await expect(page.getByTestId('inventory-bar')).toContainText('Simulated XP');
});
test('validation entry needs server permission and cannot resume a player session', async ({ page, devUrl }) => {
  await installScriptedApi(page, { validation: false });
  await page.goto(`${devUrl}/__validation`);
  await expect(page.getByRole('heading', { name: 'Internal validation is unavailable.' })).toBeVisible();
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
});

test('rapid developer location actions dispatch serially with fresh versions', async ({ page, devUrl }) => {
  const api = await installScriptedApi(page, { validation: true });
  await page.goto(`${devUrl}/__validation`); await page.getByRole('button', { name: 'Start validation session' }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await expect(page.getByTestId('validation-harness')).toBeVisible();
  await page.getByTestId('validation-harness').evaluate((panel) => {
    const buttons = [...panel.querySelectorAll('button')];
    buttons.find((button) => button.textContent === 'plaza')!.click();
    buttons.find((button) => button.textContent === 'concourse')!.click();
  });
  await expect.poll(() => api.requests.filter((request) => request.path.endsWith('/actions')).length).toBe(2);
  expect(api.state().version).toBe(2);
  expect(api.failures).toEqual([]);
});
