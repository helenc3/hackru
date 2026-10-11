import { test, expect } from '../../../../tests/support/browser-test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';

async function start(page: import('@playwright/test').Page, alreadyLoaded = false) {
  if (!alreadyLoaded) await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
}
async function typedPanel(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('world-renderer')).toBeVisible();
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  const panel = page.getByTestId('dialogue-panel');
  await expect(panel).toBeVisible();
  if (await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).count()) await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeVisible();
  return panel;
}
test('production world, voice slot, typed accessibility and practice feedback share one session; IME and focus isolation', async ({ page }) => {
  const api = await installScriptedApi(page, { steps: [
    { text: '请给我一杯水。', reply: '一杯水五元。', feedback: true },
  ] });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const preview = page.getByTestId('world-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.district-landmark', { hasText: '老王' })).toHaveCSS('display', 'block');
  await expect(preview.locator('.district-landmark', { hasText: '小李' })).toHaveCount(1);
  await start(page, true);
  const panel = await typedPanel(page);
  await expect(panel.getByTestId('recorder')).toBeVisible();
  const input = panel.getByRole('textbox');
  await input.fill('请给我一杯水。');
  await input.dispatchEvent('compositionstart', { data: '请给我一杯水' });
  await input.press('Enter');
  expect(api.requests.filter((request) => request.path.endsWith('/turns'))).toHaveLength(0);
  await page.evaluate(() => { (window as unknown as { movementKeys: string[] }).movementKeys = []; window.addEventListener('keydown', (event) => { if (['w', 'a', 's', 'd'].includes(event.key)) (window as unknown as { movementKeys: string[] }).movementKeys.push(event.key); }); });
  await input.press('w');
  expect(await page.evaluate(() => (window as unknown as { movementKeys: string[] }).movementKeys)).toEqual([]);
  await input.fill('请给我一杯水。');
  await input.dispatchEvent('compositionend', { data: '请给我一杯水。' });
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('npc-reply')).toContainText('一杯水五元。');
  await expect(panel.getByTestId('coach-panel')).toContainText('Your request was understood.');
  await expect(panel.getByRole('meter')).toHaveCount(3);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByTestId('world-renderer')).toBeVisible();
  await expect(page.getByTestId('validation-harness')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /validation|text mode/i })).toHaveCount(0);
  expect(api.remaining()).toBe(0); expect(api.failures).toEqual([]);
  const turn = api.requests.find((request) => request.path.endsWith('/turns'))?.body as { input: { source: string } };
  expect(turn.input.source).toBe('typed');

  await panel.getByRole('button', { name: 'Close conversation' }).click();
  await expect(page.getByTestId('coach-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause & Learn' })).toHaveCount(0);
});

test('Pay is disabled when money is short', async ({ page }) => {
  const pay = { kind: 'pay' as const, anchorId: 'ui.vendor', drink: 'tea' as const, priceCny: 10 };
  const api = await installScriptedApi(page, { steps: [{ text: '我要茶。', reply: '好嘞，茶十块。', patch: { npcActions: [{ anchorId: 'ui.vendor', action: pay }] } }] });
  api.patch({ inventory: { hint: 1, cny: 5, drinks: [] } });
  await start(page); const panel = await typedPanel(page);
  await panel.getByRole('textbox').fill('我要茶。'); await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('pay-button')).toBeDisabled();
  await expect(panel.getByTestId('pay-button')).toContainText('only ¥5 left');
  await expect(panel.getByRole('textbox')).toBeVisible(); // an unaffordable Pay keeps the conversation open
  expect(api.failures).toEqual([]);
});

test('verified hotel directions show Mandarin steps with English and reopen the guide to repeat', async ({ page }) => {
  const directions = { routeId: 'route-1', fromAnchorId: 'ui.guide', hotelAnchorId: 'hotel.grand', textZh: '沿着南京路往东走，上海大酒店在右边。', steps: [{ textZh: '沿着南京路往东走', english: 'Walk east along Nanjing Road' }, { textZh: '上海大酒店在右边', english: 'The hotel is on the right' }] };
  const api = await installScriptedApi(page, { mission: 'Q2', steps: [{ text: '请问，去上海大酒店怎么走？', reply: directions.textZh, patch: { directions, npcActions: [{ anchorId: 'ui.guide', action: { kind: 'show-directions' } }] } }] });
  await start(page); const panel = await typedPanel(page);
  await panel.getByRole('textbox').fill('请问，去上海大酒店怎么走？'); await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('npc-reply')).toContainText('南京路');
  await panel.getByTestId('show-directions').click();
  const card = page.getByTestId('directions-card');
  await expect(card).toContainText('Walk east along Nanjing Road');
  await card.getByRole('button', { name: 'Ask them to repeat' }).click();
  await expect(page.getByTestId('dialogue-panel')).toContainText('小李');
  expect(api.failures).toEqual([]);
});

test('Continue appears only after the server confirms the saved session', async ({ page }) => {
  const api = await installScriptedApi(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Start exploring', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continue Session' })).toHaveCount(0);
  await expect(page.getByText('Buy a drink from Lao Wang, ask Xiao Li the way to the Grand Hotel, and get your photo taken by the Huangpu River.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Continue Session' })).toBeVisible();
  expect(api.requests.some((request) => request.path === '/api/sessions/ui-player-Q1' && request.body === null)).toBe(true);
  await page.getByRole('button', { name: 'Continue Session' }).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
  api.failNext({ status: 404, code: 'SESSION_EXPIRED', message: 'This session has expired.', retryable: false });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Start exploring', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Continue Session' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'))).toBeNull();
});

test('an unavailable WebGL context keeps the session and shared recovery interface', async ({ page }) => {
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) { return typeof args[0] === 'string' && args[0].startsWith('webgl') ? null : original.apply(this, args); } as typeof original; });
  await installScriptedApi(page); await start(page);
  await expect(page.getByTestId('webgl-recovery')).toBeVisible();
  await expect(page.getByTestId('quest-panel')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'))).toBe('ui-player-Q1');
});

for (const hasSound of [true, false]) {
test(`microphone check records locally, detects ${hasSound ? 'sound' : 'silence'}, releases capture and offers playback`, async ({ page }) => {
  await page.addInitScript((hasSound) => {
    const state = { stopped: false };
    Object.assign(window, { microphoneCheck: state });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: () => { state.stopped = true; } }] }),
    } });
    class TestAudioContext {
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect: () => undefined }; }
      createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(hasSound ? 0.1 : 0) }; }
    }
    class TestMediaRecorder {
      state = 'inactive'; mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['test recording'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    Object.assign(window, { AudioContext: TestAudioContext, MediaRecorder: TestMediaRecorder });
  }, hasSound);
  await installScriptedApi(page); await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.clock.install();
  await page.getByRole('button', { name: 'Check microphone' }).click();
  await expect(page.getByTestId('start-panel')).toContainText('Recording for five seconds');
  await expect(page.getByRole('button', { name: 'Check audio', exact: true })).toBeDisabled();
  await page.clock.fastForward(5_001);
  await expect(page.getByTestId('start-panel')).toContainText(hasSound ? 'Sound detected.' : 'No sound detected.', { timeout: 10000 });
  await expect(page.locator('audio[aria-label="Your microphone test recording"]')).toHaveAttribute('src', /^blob:/);
  expect(await page.evaluate(() => (window as unknown as { microphoneCheck: { stopped: boolean } }).microphoneCheck.stopped)).toBe(true);
});

}

test('audio check plays the prerecorded Mandarin Rutgers clip', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      Object.assign(window, { checkedAudioSource: this.getAttribute('src') });
      return Promise.resolve();
    };
  });
  await installScriptedApi(page); await page.goto('/', { waitUntil: 'domcontentloaded' });
  const clip = await page.request.get('/audio/rutgers-university-zh.mp3');
  expect(clip.ok()).toBe(true);
  expect(clip.headers()['content-type']).toContain('audio/mpeg');
  expect((await clip.body()).length).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Check audio', exact: true }).click();
  await expect(page.getByTestId('start-panel')).toContainText('Playing “罗格斯大学”');
  expect(await page.evaluate(() => (window as unknown as { checkedAudioSource: string }).checkedAudioSource)).toBe('/audio/rutgers-university-zh.mp3');
});

test('quest results card closes, reopens from the progress list, and offers Play again', async ({ page }) => {
  const objectives = (complete: boolean) => [
    { id: 'q1.communication', label: 'Ask in Mandarin.', complete },
    { id: 'q1.action', label: 'Act on the answer in the world.', complete },
  ];
  const skill = { mastery: 0.5, independentCount: 1 };
  const debrief = {
    tracks: { reading: skill, listening: { mastery: 0.4, independentCount: 0 }, conversation: skill, repair: skill },
    strengths: ['Ordered a drink and paid for it.'], improvement: 'Next time, act on the announcement.', nextPracticeReason: 'Listening is untested: try audio.', nextPracticeMissionId: 'Q2' as const,
    evidenceSummary: { spokenTurns: 0, typedTurns: 1, editedTurns: 0, independentListening: 0, assistedListening: 0 },
  };
  // The scripted server clears the quest on payment.
  const api = await installScriptedApi(page, { steps: [
    { text: '我要水。', reply: '好的，五元。', patch: { npcActions: [{ anchorId: 'ui.vendor', action: { kind: 'pay', anchorId: 'ui.vendor', drink: 'water', priceCny: 5 } }] } },
    { action: { type: 'choose', choiceId: 'q1.pay', anchorId: 'ui.vendor' }, patch: { status: 'cleared', objectives: objectives(true), debrief, completedMissionIds: ['Q1'] } },
  ] });
  await start(page);
  const paymentPanel = await typedPanel(page);
  await paymentPanel.getByRole('textbox').fill('我要水。');
  await paymentPanel.getByRole('button', { name: 'Send Mandarin' }).click();
  await paymentPanel.getByTestId('pay-button').click();
  const result = page.getByTestId('result-panel');
  await expect(result).toContainText('Nicely done.');
  await expect(result.getByRole('list', { name: 'Quest summary' }).getByRole('checkbox', { checked: true })).toHaveCount(2);
  await expect(page.getByTestId('vocab-review')).toContainText('Vocab to study');
  await expect(page.getByTestId('vocab-review')).toContainText('Vocab to study');
  await result.getByRole('button', { name: 'Close results' }).click();
  await expect(result).toHaveCount(0);
  const progress = page.getByTestId('mission-progress');
  await expect(progress.getByRole('checkbox', { name: 'Buy a drink from Lao Wang cleared' })).toBeChecked();
  await progress.getByRole('button', { name: 'Review Buy a drink from Lao Wang' }).click();
  await expect(result).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(result).toHaveCount(0);
  await progress.getByRole('button', { name: 'Review Buy a drink from Lao Wang' }).click();
  await expect(result.getByRole('button', { name: 'Play again' })).toHaveCount(0);
  await expect(result.getByRole('button', { name: 'Retry mission' })).toHaveCount(0);
  expect(api.failures).toEqual([]);
});

test('a goodbye ends the conversation and shows the summary card with the exchange', async ({ page }) => {
  const api = await installScriptedApi(page, { steps: [{ text: '我要水。', reply: '好的。', feedback: true }, { text: '再见。', reply: '好的，再见！', end: true }] });
  await start(page); const panel = await typedPanel(page);
  await panel.getByRole('textbox').fill('我要水。'); await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('npc-reply')).toContainText('好的。');
  await panel.getByRole('textbox').fill('再见。'); await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  const card = page.getByTestId('conversation-card');
  await expect(card).toContainText('CONVERSATION COMPLETE');
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  await expect(card.locator('.chat-thread')).toContainText('好的，再见！');
  await expect(card.getByRole('list', { name: 'Quest summary' }).getByRole('checkbox')).toHaveCount(1); // one goal per quest
  // A goodbye is final: the card offers no way back into the conversation.
  await expect(card.getByRole('button', { name: 'Talk again' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Back to the world' }).click();
  await expect(card).toHaveCount(0);
  // Closing by hand is not a goodbye: no card.
  await (await typedPanel(page)).getByRole('button', { name: 'Close conversation' }).click();
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  await expect(card).toHaveCount(0);
  expect(api.failures).toEqual([]);
});
