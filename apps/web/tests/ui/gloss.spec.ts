import { test, expect, type Locator, type Page } from '../../../../tests/support/browser-test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';

// A tiny per-character dictionary stands in for the server's segmenter.
const glosses: Record<string, [string, string]> = { 好: ['hǎo', 'good'], 嘞: ['lei', '(particle)'], 水: ['shuǐ', 'water'], 五: ['wǔ', 'five'], 块: ['kuài', 'yuan (money)'], 老: ['lǎo', 'old'], 王: ['wáng', 'Wang (surname)'] };
async function mockDictionary(page: Page) {
  const annotated: string[] = [];
  await page.route('**/api/dictionary/annotate', async (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    annotated.push(text);
    const tokens = [...text].map((char) => glosses[char] ? { text: char, pinyin: glosses[char][0], entries: [{ simplified: char, traditional: char, pinyin: glosses[char][0], english: [glosses[char][1]] }] } : { text: char });
    await route.fulfill({ json: { tokens, pinyin: tokens.map((token) => token.pinyin ?? token.text).join(' '), translation: text === '好嘞，水五块。' ? 'Sure — water is five yuan.' : undefined, translationSource: text === '好嘞，水五块。' ? 'claude' : 'none' } });
  });
  return annotated;
}
/** Screen centre of the first occurrence of `char` inside `locator`. */
async function charPoint(locator: Locator, char: string) {
  return locator.first().evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent!.indexOf(target);
      if (index < 0) continue;
      const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + target.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    throw new Error(`${target} not found`);
  }, char);
}
async function shiftClick(page: Page, point: { x: number; y: number }) {
  await page.keyboard.down('Shift'); await page.mouse.click(point.x, point.y); await page.keyboard.up('Shift');
}
async function enter(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const resume = page.getByRole('button', { name: 'Continue Session' });
  await (await resume.count() ? resume : page.getByRole('button', { name: 'Start exploring', exact: true })).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
}

test('shift-click glosses an NPC reply, saves a word for review across reloads, and plain clicks keep working', async ({ page }) => {
  await installScriptedApi(page, { steps: [{ text: '我要水。', reply: '好嘞，水五块。' }] });
  const annotated = await mockDictionary(page);
  await enter(page);

  // Talk as usual (E beside the NPC); Shift+click on the NPC's Chinese name explains it without closing anything.
  await page.getByTestId('world-renderer').focus(); await page.keyboard.press('e');
  const panel = page.getByTestId('dialogue-panel');
  await expect(panel).toBeVisible();
  await shiftClick(page, await charPoint(panel.locator('#dialogue-title'), '王'));
  const popover = page.getByTestId('gloss-popover');
  await expect(popover.getByTestId('gloss-word')).toContainText('wáng');
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(panel).toBeVisible();

  if (await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).count()) await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await panel.getByRole('textbox').fill('我要水。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('npc-reply')).toHaveText('好嘞，水五块。');

  await shiftClick(page, await charPoint(page.getByTestId('npc-reply'), '水'));
  await expect(popover.getByTestId('gloss-line-pinyin')).toHaveText('hǎo lei ， shuǐ wǔ kuài 。');
  await expect(popover.getByTestId('gloss-translation')).toHaveText('Sure — water is five yuan.');
  await expect(popover.getByTestId('gloss-word')).toContainText('shuǐ');
  await expect(popover.getByTestId('gloss-word')).toContainText('water');
  await popover.getByTestId('gloss-review-toggle').click();
  await expect(popover.getByTestId('gloss-review-toggle')).toHaveText('In review ✓');
  // Escape closes the explanation, not the conversation; the line was annotated once.
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(panel).toBeVisible();
  expect(annotated.filter((text) => text === '好嘞，水五块。')).toHaveLength(1);

  // Keyboard path: Enter on the reply bubble opens the same explanation.
  await panel.getByTestId('npc-reply').focus();
  await page.keyboard.press('Enter');
  await expect(popover.getByTestId('gloss-line-pinyin')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload({ waitUntil: 'domcontentloaded' });
  const resume = page.getByRole('button', { name: 'Continue Session' });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await page.getByTestId('review-toggle').click();
  const review = page.getByTestId('review-panel');
  await expect(review.getByTestId('review-word')).toHaveCount(1);
  await expect(review.getByTestId('review-word')).toContainText('水');
  await expect(review.getByTestId('review-word')).toContainText('shuǐ');
  await expect(review.getByTestId('review-word')).toContainText('好嘞，水五块。');
  await review.getByRole('button', { name: 'Remove 水' }).click();
  await expect(review.getByTestId('review-word')).toHaveCount(0);
  await expect(page.getByTestId('review-toggle')).toHaveText('Review · 0');
});
