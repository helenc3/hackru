import { expect, test } from '@playwright/test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';
import { createGame, updateSkillsAfterAttempt, type PublicState } from '@vibequest/shared';

function terminalDebrief(): PublicState['debrief'] {
  const state = createGame({ sessionId: 'debrief-session', attemptId: 'debrief-attempt', missionId: 'B1', initialTier: 1, validationMode: false, inputPreference: 'voice', providerStatus: 'fixture' }, 0);
  state.status = 'cleared';
  state.evidence = [
    { id: 'reading-one', attemptId: state.attemptId, missionId: 'B1', track: 'reading', cueId: 'b1.destination-board', score: 1, independent: true, firstAttempt: true, validationMode: false, listeningAssisted: false, providerFailure: false },
    { id: 'subtitles-one', attemptId: state.attemptId, missionId: 'B1', track: 'listening', cueId: 'b1.harbor-change', score: 1, independent: false, firstAttempt: true, validationMode: false, listeningAssisted: true, providerFailure: false },
    ...(['spoken', 'typed', 'edited'] as const).map((source) => ({ id: source, attemptId: state.attemptId, missionId: 'B1' as const, track: 'conversation' as const, turnId: source, conversationSource: source, score: 1 as const, independent: true, firstAttempt: true, validationMode: false, listeningAssisted: false, providerFailure: false })),
  ];
  return updateSkillsAfterAttempt(state).debrief;
}

test('boss result reveals honest modality, untested listening and one Station Navigator badge', async ({ page }) => {
  const api = await installScriptedApi(page, { mission: 'B1', steps: [{ text: '我要一张去海港的票。', patch: { status: 'cleared', badges: ['station-navigator'], debrief: terminalDebrief() } }] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await expect(page.getByTestId('skill-debrief')).toHaveCount(0);
  await page.getByRole('button', { name: '老周 · Talk', exact: true }).click();
  const panel = page.getByTestId('dialogue-panel');
  await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await panel.getByRole('textbox').fill('我要一张去海港的票。');
  await panel.getByRole('button', { name: 'Send Mandarin', exact: true }).click();
  const debrief = page.getByTestId('skill-debrief');
  await expect(debrief).toBeVisible();
  await expect(debrief).toContainText('1 verified spoken, 1 typed, 1 edited');
  await expect(debrief).toContainText('0 independent, 1 assisted');
  await expect(debrief).toContainText('Listening is untested');
  await expect(page.getByText('Badge: Station Navigator', { exact: true })).toHaveCount(1);
  await expect(debrief).toContainText('Badge evidence');
  await expect(debrief).toContainText('written Mandarin cue');
  await expect(debrief).toContainText('Next practice');
  await expect(debrief).toContainText('do not assess pronunciation');
  expect(api.failures).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('debrief.png'), fullPage: true });
});

test('failed attempt shows the debrief without a success badge', async ({ page }) => {
  await installScriptedApi(page, { mission: 'B1', steps: [{ text: '我要一张去海港的票。', patch: { status: 'failed', debrief: terminalDebrief() } }] });
  await page.goto('/'); await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('button', { name: '老周 · Talk', exact: true }).click();
  const panel = page.getByTestId('dialogue-panel');
  await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await panel.getByRole('textbox').fill('我要一张去海港的票。'); await panel.getByRole('button', { name: 'Send Mandarin', exact: true }).click();
  await expect(page.getByTestId('skill-debrief')).toContainText('Practice after this attempt');
  await expect(page.getByTestId('skill-debrief')).not.toContainText('Station Navigator');
});
