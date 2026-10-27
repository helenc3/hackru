import { test, expect } from '../../../../tests/support/browser-test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';

test('start screen selects English for the actual session and continues it without changing language', async ({ page }) => {
  test.setTimeout(60_000); // Two page loads, a world render and a conversation on software WebGL.
  const api = await installScriptedApi(page, { steps: [{ text: 'I want tea.', reply: 'Tea is ten yuan.' }] });
  await page.goto('/');
  const selector = page.getByLabel('Conversation language', { exact: true });
  await expect(selector).toHaveValue('zh');
  await selector.selectOption('en');
  await expect(page.getByRole('heading', { name: 'Explore Shanghai in English.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/english-start-screen.png' });
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  const create = api.requests.find((request) => request.path === '/api/sessions');
  expect(create?.body).toMatchObject({ language: 'en' });
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  const panel = page.getByTestId('dialogue-panel');
  await expect(panel).toContainText('Hello! What would you like to drink?');
  await panel.getByRole('button', { name: 'Use typed English', exact: true }).click();
  await panel.getByRole('textbox').fill('I want tea.');
  await panel.getByRole('button', { name: 'Send English', exact: true }).click();
  await expect(panel.getByTestId('npc-reply')).toHaveText('Tea is ten yuan.');
  await expect(panel.getByTestId('npc-reply')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(selector).toHaveValue('zh');
  await page.getByRole('button', { name: 'Continue Session', exact: true }).click();
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  await expect(panel.getByRole('button', { name: 'Send English', exact: true })).toBeVisible();
  expect(api.requests.filter((request) => request.path === '/api/sessions')).toHaveLength(1);
});
