import { expect, test } from '../../../../tests/support/browser-test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';
import type { PublicState } from '@vibequest/shared';

// A server-shaped terminal debrief; the UI only renders what the server projects.
const skill = (mastery: number, independentCount: number) => ({ mastery, independentCount });
const terminalDebrief = (): NonNullable<PublicState['debrief']> => ({
  tracks: { reading: skill(0.7, 1), listening: skill(0.4, 0), conversation: skill(0.75, 3), repair: skill(0.4, 0) },
  strengths: ['Asked a passerby for a photo in Mandarin.'], improvement: 'Next time, listen to directions without subtitles.',
  nextPracticeReason: 'Listening is untested: ask a local for directions by voice.', nextPracticeMissionId: 'Q2',
  evidenceSummary: { spokenTurns: 1, typedTurns: 1, editedTurns: 1, independentListening: 0, assistedListening: 1 },
});
async function finishPhoto(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await expect(page.getByTestId('skill-debrief')).toHaveCount(0);
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  const panel = page.getByTestId('dialogue-panel');
  await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await panel.getByRole('textbox').fill('可以帮我在这里拍张照吗？');
  await panel.getByRole('button', { name: 'Send Mandarin', exact: true }).click();
}

test('final quest result reveals honest modality, untested listening and one Shanghai Explorer badge', async ({ page }) => {
  const api = await installScriptedApi(page, { mission: 'Q3', steps: [{ text: '可以帮我在这里拍张照吗？', patch: { status: 'cleared', badges: ['shanghai-explorer'], debrief: terminalDebrief() } }] });
  await finishPhoto(page);
  const debrief = page.getByTestId('skill-debrief');
  await expect(debrief).toBeVisible();
  await expect(debrief).toContainText('1 verified spoken, 1 typed, 1 edited');
  await expect(debrief).toContainText('0 independent, 1 assisted');
  await expect(debrief).toContainText('Listening is untested');
  await expect(page.getByText('Badge: Shanghai Explorer', { exact: true })).toHaveCount(1);
  await expect(debrief).toContainText('Badge evidence');
  await expect(debrief).toContainText('Next practice');
  await expect(debrief).toContainText('do not assess pronunciation');
  expect(api.failures).toEqual([]);
});

test('failed attempt shows the debrief without a success badge', async ({ page }) => {
  await installScriptedApi(page, { mission: 'Q3', steps: [{ text: '可以帮我在这里拍张照吗？', patch: { status: 'failed', debrief: terminalDebrief() } }] });
  await finishPhoto(page);
  await expect(page.getByTestId('skill-debrief')).toContainText('Practice after this attempt');
  await expect(page.getByTestId('skill-debrief')).not.toContainText('Shanghai Explorer');
});
