import { test, expect, type Page } from '@playwright/test';
import { PublicStateSchema, TurnResponseSchema } from '@vibequest/shared';
import { fixtureState, installScriptedApi } from '../../../../fixtures/ui/scripted-api';

/** Fake mic + Web Audio: no device, no sound, observable counters. The worklet node emits silent capture frames. */
async function fakeAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, number>;
    w.__gum = 0; w.__scheduled = 0; w.__stopped = 0; w.__trackStops = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { w.__gum++; return { getTracks: () => [{ stop: () => { w.__trackStops++; } }] }; } } });
    class FakeContext {
      sampleRate = 48_000; currentTime = 0; destination = {};
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

async function openPanel(page: Page) {
  await installScriptedApi(page);
  // Registered last, so it wins: the session starts with live providers.
  await page.route('**/api/sessions', (route) => route.fulfill({ json: { state: liveState() } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await page.getByRole('button', { name: '小林 · Talk', exact: true }).click();
  return page.getByTestId('dialogue-panel');
}

test('live voice streams mic audio, renders transcripts, applies turns and honours interruptions', async ({ page }) => {
  await fakeAudio(page);
  const urls: string[] = [];
  const binaryFrames: number[] = [];
  const texts: string[] = [];
  await page.routeWebSocket(/\/api\/sessions\/[^/]+\/live/, (ws) => {
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
      const state = PublicStateSchema.parse({ ...liveState(), version: 1, objectives: liveState().objectives.map((objective, index) => ({ ...objective, complete: index === 0 })) });
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
  await expect(page.getByTestId('quest-panel').locator('li[data-complete="true"]')).toHaveCount(1);
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
  await panel.getByRole('button', { name: 'Close conversation' }).click();
  await expect.poll(() => counter(page, '__trackStops')).toBe(1);
  expect(texts.some((text) => JSON.parse(text).type === 'stop')).toBe(true);
});

test('interrupted flushes queued NPC audio', async ({ page }) => {
  await fakeAudio(page);
  await page.routeWebSocket(/\/live/, (ws) => {
    ws.send(JSON.stringify({ type: 'ready', npcId: 'vendor', sampleRate: 24000 }));
    let first = true;
    ws.onMessage((message) => {
      if (typeof message === 'string' || !first) return;
      first = false;
      ws.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(48000).toString('base64') }));
      ws.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(48000).toString('base64') }));
      setTimeout(() => ws.send(JSON.stringify({ type: 'interrupted' })), 150);
    });
  });
  const panel = await openPanel(page);
  const status = panel.getByTestId('live-status');
  await expect(status).toHaveAttribute('data-status', 'npc-speaking');
  await expect(status).toHaveAttribute('data-status', 'live');
  expect(await counter(page, '__stopped')).toBe(2);
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
      ws.send(JSON.stringify({ type: 'turn', turn: TurnResponseSchema.parse({ turnId: 'live-bye', state: PublicStateSchema.parse({ ...liveState(), version: 1 }), events: [], npcReply: '好的，再见！', conversationEnded: true }) }));
      setTimeout(() => ws.send(JSON.stringify({ type: 'closed', reason: 'farewell' })), 300);
    });
  });
  const panel = await openPanel(page);
  await expect(panel.getByTestId('npc-reply')).toContainText('好的，再见！');
  await expect(page.getByTestId('dialogue-panel')).toHaveCount(0);
  expect(await counter(page, '__trackStops')).toBe(1);
});
