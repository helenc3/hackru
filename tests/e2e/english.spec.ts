import { expect, test } from '../support/browser-test';
import { interact, playerState, say, startWorld, walkToQuestTarget, worldReady } from './helpers';

test('English testing uses the real session API, pays the same price, and survives reload', async ({ page, request }) => {
  await startWorld(page, 'fixture', '', 'en');
  let state = await playerState(page, request);
  expect(state.language).toBe('en');
  const id = state.sessionId;
  await walkToQuestTarget(page);
  state = await playerState(page, request);
  const vendor = state.interactables.find((entry) => entry.role === 'vendor')!;
  expect(vendor.label).toBe('Lao Wang');
  await interact(page, vendor.id);
  const panel = page.getByTestId('dialogue-panel');
  await expect(panel).toContainText('Hello! What would you like to drink?');
  await say(page, 'Hello.');
  for (let i = 0; i < 3; i++) await say(page, 'I am from America.');
  expect(await say(page, 'Please give me a cup of tea.')).toContain('10 yuan');
  await panel.getByTestId('pay-button').click();
  await expect(page.getByTestId('result-panel')).toBeVisible();
  state = await playerState(page, request);
  expect(state).toMatchObject({ language: 'en', status: 'cleared', completedMissionIds: ['Q1'], inventory: { cny: 10, drinks: ['tea'] } });
  expect(state.purchases).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: 'Continue Session', exact: true }).click();
  await worldReady(page);
  expect(await playerState(page, request)).toMatchObject({ sessionId: id, language: 'en', completedMissionIds: ['Q1'] });
});
