import { test, expect, type Page } from '@playwright/test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';

const water = { simplified: '水', traditional: '水', pinyin: 'shuǐ', english: ['water', 'river'] };
const boiled = { simplified: '开水', traditional: '開水', pinyin: 'kāishuǐ', english: ['boiled water'] };

async function setup(page: Page) {
  await installScriptedApi(page);
  const queries: string[] = [];
  // Registered after the scripted API, so it takes precedence for dictionary lookups.
  await page.route('**/api/dictionary/lookup**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    queries.push(q);
    if (q === '我要水') return route.fulfill({ status: 422, json: { error: { code: 'PHRASE_NOT_ALLOWED', message: 'Look up one word at a time: 我要水 is a phrase.', retryable: false } } });
    const entries = q === '水' || q === 'shui' ? [water] : q === 'water' ? [water, boiled] : [];
    return route.fulfill({ json: { query: q, entries } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
  return queries;
}

test('the pocket dictionary finds single words by Hanzi, pinyin or English and rejects phrases', async ({ page }) => {
  const queries = await setup(page);
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('/'); // shortcut opens the panel when not typing
  const panel = page.getByTestId('lookup-panel');
  const search = panel.getByRole('searchbox', { name: 'Look up one word' });
  await expect(search).toBeFocused();

  for (const q of ['水', 'shui']) {
    await search.fill(q);
    await expect(panel.getByTestId('lookup-entry')).toHaveCount(1);
    await expect(panel.getByTestId('lookup-entry')).toContainText('shuǐ');
    await expect(panel.getByTestId('lookup-entry')).toContainText('water; river');
  }
  await search.fill('water');
  await expect(panel.getByTestId('lookup-entry')).toHaveCount(2);
  await expect(panel.getByTestId('lookup-entry').nth(1)).toContainText('開水');

  // Spaces or punctuation are caught client-side: friendly message, no request.
  const before = queries.length;
  for (const phrase of ['我要 水', 'boiled water', '水。']) {
    await search.fill(phrase);
    await expect(panel.getByTestId('lookup-phrase')).toHaveText('Single words only — try 水 or water.');
  }
  await page.waitForTimeout(400); // past the debounce
  expect(queries.length).toBe(before);
  // A Hanzi phrase is only detectable by the server's segmentation.
  await search.fill('我要水');
  await expect(panel.getByTestId('lookup-error')).toHaveText('Look up one word at a time: 我要水 is a phrase.');
});

test('add to review persists, and typing in the dictionary never reaches world movement', async ({ page }) => {
  await setup(page);
  await page.getByTestId('lookup-toggle').click();
  const panel = page.getByTestId('lookup-panel');
  const search = panel.getByRole('searchbox', { name: 'Look up one word' });
  await page.evaluate(() => { (window as unknown as { movementKeys: string[] }).movementKeys = []; window.addEventListener('keydown', (event) => { if (['w', 'a', 's', 'd'].includes(event.key)) (window as unknown as { movementKeys: string[] }).movementKeys.push(event.key); }); });
  await search.pressSequentially('water');
  expect(await page.evaluate(() => (window as unknown as { movementKeys: string[] }).movementKeys)).toEqual([]);

  const add = panel.getByTestId('lookup-entry').first().getByRole('button', { name: 'Add to review' });
  await add.click();
  await expect(panel.getByTestId('lookup-entry').first().getByRole('button', { name: 'In review ✓' })).toHaveAttribute('aria-pressed', 'true');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('vibequest.review-words.v1') ?? '[]') as { simplified: string; pinyin: string }[]);
  expect(stored).toMatchObject([{ simplified: '水', pinyin: 'shuǐ' }]);

  // Arrow keys move between results; Escape closes and hands focus back to the world.
  await search.press('ArrowDown');
  await expect(panel.getByTestId('lookup-entry').first().getByRole('button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId('world-renderer')).toBeFocused();
});
