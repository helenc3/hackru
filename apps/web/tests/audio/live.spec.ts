import { test, expect, type Page } from '../../../../tests/support/browser-test';
import { PublicStateSchema, TurnResponseSchema } from '@vibequest/shared';
import { fixtureState, installScriptedApi } from '../../../../fixtures/ui/scripted-api';

/** Fake mic + Web Audio: no device, no sound, observable counters. The worklet node emits silent capture frames. */
async function fakeAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, number>;
    w.__mouthLevel = .15; w.__gum = 0; w.__scheduled = 0; w.__stopped = 0; w.__trackStops = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { w.__gum++; return { getTracks: () => [{ stop: () => { w.__trackStops++; } }] }; } } });
    class FakeContext {
      state = 'running'; sampleRate = 48_000; currentTime = 0; destination = {};
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(data: Float32Array) { data.fill(w.__scheduled! > w.__stopped! ? w.__mouthLevel! : 0); }, disconnect() {} }; }
      audioWorklet = { addModule: async () => undefined };
      resume = async () => undefined; close = async () => undefined;
      createMediaStreamSource() { return { connect() { /* fake */ } }; }
      createBuffer(_channels: number, length: number, rate: number) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
      createBufferSource() { return { buffer: null, onended: null as null | (() => void), connect() { /* fake */ }, start() { w.__scheduled++; }, stop() { w.__stopped++; } }; }
    }
    class FakeWorkletNode {
      port: { onmessage: ((event: { data: Float32Array }) => void) | null } = { onmessage: null };
      constructor() { const emit = () => { this.port.onmessage?.({ data: new Float32Array(4800) }); setTimeout(emit, 100); }; setTimeout(emit, 20); }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
    (window as unknown as { AudioWorkletNode: unknown }).AudioWorkletNode = FakeWorkletNode;
  });
}
const counter = (page: Page, name: string) => page.evaluate((key) => Number((window as unknown as Record<string, unknown>)[key]), name);
const liveState = () => PublicStateSchema.parse({ ...fixtureState('Q1'), providerStatus: 'live' });

async function openPanel(page: Page, showTranscripts = true) {
  const api = await installScriptedApi(page);
  // Keep movement and audio bookkeeping responses in the same live session.
  api.patch({ providerStatus: 'live' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  if (!showTranscripts) await page.getByLabel('Show conversation transcripts', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await page.getByTestId('world-renderer').focus();
  await page.keyboard.press('e');
  return page.getByTestId('dialogue-panel');
}
test('live voice streams mic audio, renders transcripts, applies turns and honours interruptions', async ({ page }) => {
  await fakeAudio(page);
  let interrupt: (() => void) | undefined;
  const urls: string[] = [];
  const binaryFrames: number[] = [];
  const texts: string[] = [];
  await page.routeWebSocket(/\/api\/sessions\/[^/]+\/live/, (ws) => {
    interrupt = () => ws.send(JSON.stringify({ type: 'interrupted' }));
    urls.push(ws.url());
    ws.send(JSON.stringify({ type: 'ready', npcId: 'vendor', sampleRate: 24000 }));
    ws.onMessage((message) => {
      if (typeof message === 'string') { texts.push(message); return; }
      binaryFrames.push(message.length);
      if (binaryFrames.length !== 1) return;
      ws.send(JSON.stringify({ type: 'playerTranscript', text: '我要', final: false }));
      ws.send(JSON.stringify({ type: 'playerTranscript', text: '我要一杯茶。', final: true }));
      ws.send(JSON.stringify({ type: 'npcTranscript', text: '一杯茶十元。', final: true }));
      ws.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(4800).toString('base64') }));
      ws.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(4800).toString('base64') }));
      const state = PublicStateSchema.parse({ ...liveState(), version: 1, xp: 7 });
      ws.send(JSON.stringify({ type: 'turn', turn: TurnResponseSchema.parse({ turnId: 'live-turn-1', state, events: [{ id: 'live-event-1', kind: 'objective', message: 'Order placed.' }], npcReply: '一杯茶十元。', feedback: { understood: 'You asked for tea.', explanation: 'Say the price back to confirm.', improvedExample: '茶十元。' }, vibe: { intent: .9, clarity: .8, courtesy: .8 } }) }));
    });
  });
  const panel = await openPanel(page);
  const status = panel.getByTestId('live-status');
  // The scripted server answers the first mic frame within milliseconds, so a slow runner may already see the reply playing.
  await expect(status).toHaveAttribute('data-status', /^(live|npc-speaking)$/);
  expect(urls[0]).toMatch(/^ws:\/\/[^/]+\/api\/sessions\/ui-player-Q1\/live\?npcId=vendor&anchorId=ui\.vendor$/);
  expect(await counter(page, '__gum')).toBe(1);
  await expect(panel.getByRole('button', { name: 'Start recording' })).toHaveCount(0);
  await expect(panel.getByTestId('npc-reply')).toHaveText('一杯茶十元。');
  await expect(panel.locator('.bubble.player')).toHaveText('我要一杯茶。');
  expect(binaryFrames[0]).toBeGreaterThanOrEqual(1280); // ≥ one 40 ms PCM16 frame at 16 kHz
  await expect(page.getByLabel('Quest updates')).toContainText('Order placed.');
  await expect(panel.getByTestId('live-coach')).toContainText('Say the price back to confirm.');
  await expect(panel.getByTestId('live-coach').locator('.mandarin-chip')).toHaveText('茶十元。');
  await expect(panel.locator('.thread-notice')).toHaveText('Order placed.');
  await expect.poll(() => counter(page, '__scheduled')).toBe(2);
  await expect(status).toHaveAttribute('data-status', 'npc-speaking');
  await panel.getByRole('button', { name: 'Pause mic' }).click();
  await expect(status).toHaveAttribute('data-status', 'paused');
  await panel.getByRole('button', { name: 'Resume' }).click();
  await expect(status).toHaveAttribute('data-status', 'npc-speaking');
  interrupt!();
  await expect(status).toHaveAttribute('data-status', 'live');
  expect(await counter(page, '__stopped')).toBe(2);
  await panel.getByRole('button', { name: 'Close conversation' }).click();
  await expect.poll(() => counter(page, '__trackStops')).toBe(1);
  expect(texts.some((text) => JSON.parse(text).type === 'stop')).toBe(true);
});

test('transcripts-off hides live captions and coaching while voice and turns still work', async ({ page }) => {
  await fakeAudio(page);
  let delivered = false;
  await page.routeWebSocket(/\/live/, (ws) => {
    ws.send(JSON.stringify({ type: 'ready', npcId: 'vendor', sampleRate: 24000 }));
    ws.onMessage((message) => {
      if (typeof message === 'string' || delivered) return;
      delivered = true;
      ws.send(JSON.stringify({ type: 'playerTranscript', text: '我要茶。', final: true }));
      ws.send(JSON.stringify({ type: 'npcTranscript', text: '一杯茶十元。', final: true }));
      ws.send(JSON.stringify({ type: 'npcTranscript', text: '还需要', final: false }));
      ws.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(4800).toString('base64') }));
      ws.send(JSON.stringify({ type: 'turn', turn: TurnResponseSchema.parse({
        turnId: 'listening-turn', state: { ...liveState(), version: 1 }, events: [], npcReply: '一杯茶十元。',
        feedback: { understood: 'You asked for tea.', explanation: 'Confirm the price.', improvedExample: '茶十元。' },
      }) }));
    });
  });
  const panel = await openPanel(page, false);
  await expect.poll(() => counter(page, '__scheduled')).toBeGreaterThan(0);
  await expect(panel).toContainText('Transcripts off');
  await expect(panel.locator('.bubble.player, .bubble.npc, .bubble.coach')).toHaveCount(0);
  await expect(panel.getByTestId('coach-panel')).toHaveCount(0);
  await expect(panel.getByRole('textbox')).toHaveCount(0);
  // Explicit typed accessibility is still usable; it reveals text rather than silently disabling input.
  await panel.getByRole('button', { name: 'Use typed Mandarin', exact: true }).click();
  await expect(panel.getByRole('textbox')).toBeVisible();
  await expect(panel.locator('.bubble.npc').last()).toHaveText('一杯茶十元。');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('start-panel').getByLabel('Show conversation transcripts')).not.toBeChecked();
});

test('a 4xxx close falls back to the batch recorder without opening the mic', async ({ page }) => {
  await fakeAudio(page);
  await page.routeWebSocket(/\/live/, (ws) => { ws.close({ code: 4001, reason: 'unavailable' }); });
  const panel = await openPanel(page);
  await expect(panel.getByRole('button', { name: 'Start recording' })).toBeVisible();
  await expect(panel.getByTestId('live-status')).toHaveCount(0);
  expect(await counter(page, '__gum')).toBe(0);
});

test('a farewell turn followed by the server closing ends the conversation', async ({ page }) => {
  await fakeAudio(page);
  await page.routeWebSocket(/\/api\/sessions\/[^/]+\/live/, (ws) => {
    ws.send(JSON.stringify({ type: 'ready', npcId: 'vendor', sampleRate: 24000 }));
    let sent = false;
    ws.onMessage((message) => {
      if (typeof message === 'string' || sent) return;
      sent = true;
      ws.send(JSON.stringify({ type: 'playerTranscript', text: '再见。', final: true }));
      ws.send(JSON.stringify({ type: 'npcTranscript', text: '好的，再见！', final: true }));
      ws.send(JSON.stringify({ type: 'turn', turn: TurnResponseSchema.parse({ turnId: 'live-bye', state: PublicStateSchema.parse({ ...liveState(), version: 1 }), events: [{ id: 'farewell-event', kind: 'objective', message: 'Conversation ended.' }], npcReply: '好的，再见！', conversationEnded: true }) }));
      setTimeout(() => ws.send(JSON.stringify({ type: 'closed', reason: 'farewell' })), 300);
    });
  });
  await openPanel(page);
  await expect(page.getByLabel('Quest updates')).toContainText('Conversation ended.');
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  expect(await counter(page, '__trackStops')).toBe(1);
});


test('Lao Wang mouth follows NPC output amplitude and stops on interruption and close', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await fakeAudio(page);
  let interrupt: (() => void) | undefined;
  await page.routeWebSocket(/\/live/, (ws) => {
    let delivered = false;
    interrupt = () => ws.send(JSON.stringify({ type: 'interrupted' }));
    ws.send(JSON.stringify({ type: 'ready', sampleRate: 24000 }));
    ws.onMessage((message) => {
      if (typeof message === 'string' || delivered) return;
      delivered = true;
      ws.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(4800).toString('base64') }));
    });
  });
  const panel = await openPanel(page);
  const portrait = panel.getByTestId('npc-portrait');
  await expect(portrait).toHaveAttribute('data-mouth', 'open');
  await page.evaluate(() => { (window as unknown as Record<string, number>).__mouthLevel = .035; });
  await expect(portrait).toHaveAttribute('data-mouth', 'half-open');
  await page.evaluate(() => { (window as unknown as Record<string, number>).__mouthLevel = 0; });
  await expect(portrait).toHaveAttribute('data-mouth', 'closed');
  await page.evaluate(() => { (window as unknown as Record<string, number>).__mouthLevel = .15; });
  await expect(portrait).toHaveAttribute('data-mouth', 'open');
  interrupt!();
  await expect(portrait).toHaveAttribute('data-mouth', 'closed');
  await panel.getByRole('button', { name: 'Close conversation' }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => counter(page, '__trackStops')).toBe(1);
});
