import { test, expect, type Page } from '@playwright/test';
import { TurnRequestSchema, TurnResponseSchema } from '@vibequest/shared';
import { installScriptedApi, type Step } from '../../../../fixtures/ui/scripted-api';

/** Fake microphone + playback: no device, no audible output, observable counters. */
async function fakeMedia(page: Page, options: { deny?: boolean } = {}) {
  await page.addInitScript(({ deny }) => {
    const w = window as unknown as Record<string, number | boolean | undefined>;
    w.__gum = 0; w.__trackStops = 0; w.__plays = 0; w.__holdPlayback = false;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      w.__gum = Number(w.__gum) + 1;
      if (deny) throw new DOMException('denied', 'NotAllowedError');
      return { getTracks: () => [{ stop: () => { w.__trackStops = Number(w.__trackStops) + 1; } }] };
    } } });
    class FakeRecorder {
      static isTypeSupported(type: string) { return type.startsWith('audio/webm'); }
      state = 'inactive'; mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType?: string }) { this.mimeType = options?.mimeType ?? 'audio/webm'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['fake-opus'], { type: this.mimeType }) }); this.onstop?.(); }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      w.__plays = Number(w.__plays) + 1;
      const finish = () => w.__holdPlayback ? setTimeout(finish, 20) : this.dispatchEvent(new Event('ended'));
      setTimeout(finish, 50);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() { /* fake */ };
    Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true, get() { return (this as { fakeSrc?: string }).fakeSrc ?? ''; }, set(value: string) { (this as { fakeSrc?: string }).fakeSrc = value; } });
  }, options);
}
const counter = (page: Page, name: string) => page.evaluate((key) => Number((window as unknown as Record<string, unknown>)[key]), name);

async function openPanel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await page.getByRole('button', { name: '小林 · Talk', exact: true }).click();
  return page.getByTestId('dialogue-panel');
}
function phases(api: Awaited<ReturnType<typeof installScriptedApi>>) {
  return api.requests.filter((request) => request.path.endsWith('/actions')).map((request) => (request.body as { action: { type: string; phase?: string; operationId?: string } }).action).filter((action) => action.type === 'audioPhase');
}
/** Turn responses carrying a server speech ID; the speech route is scripted per test. */
async function speechTurns(page: Page, api: Awaited<ReturnType<typeof installScriptedApi>>, speechId = 'speech-1') {
  await page.route('**/api/sessions/*/turns', async (route) => {
    const input = TurnRequestSchema.parse(route.request().postDataJSON());
    api.requests.push({ path: new URL(route.request().url()).pathname, body: input });
    api.patch({ version: api.state().version + 1 });
    await route.fulfill({ json: TurnResponseSchema.parse({ turnId: input.turnId, state: api.state(), events: [], npcReply: '好的，一杯茶十元。', speechId }) });
  });
}
async function transcribeAs(page: Page, text: string) {
  const uploads: string[] = [];
  await page.route('**/api/sessions/*/transcriptions', async (route) => {
    uploads.push(route.request().postDataBuffer()?.toString('latin1') ?? '');
    await route.fulfill({ json: { text, transcriptionId: 'tx-1' } });
  });
  return uploads;
}

test('nothing records at load; a recording becomes a transcript that only Send submits', async ({ page }) => {
  await fakeMedia(page);
  const api = await installScriptedApi(page, { steps: [{ text: '请给我一杯茶。' }] });
  const uploads = await transcribeAs(page, '请给我一杯茶。');
  const panel = await openPanel(page);
  expect(await counter(page, '__gum')).toBe(0);
  await panel.getByRole('button', { name: 'Start recording' }).click();
  await panel.getByRole('button', { name: 'Stop recording' }).click();
  await expect(panel.getByRole('textbox')).toHaveValue('请给我一杯茶。');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toContain('name="audio"');
  expect(await counter(page, '__trackStops')).toBe(1);
  expect(phases(api).map((action) => action.phase)).toEqual(['recording', 'transcribing', 'confirming']);
  expect(new Set(phases(api).map((action) => action.operationId)).size).toBe(1);
  expect(api.requests.some((request) => request.path.endsWith('/turns'))).toBe(false);
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByTestId('npc-reply')).toBeVisible();
  expect(phases(api).map((action) => action.phase)).toEqual(['recording', 'transcribing', 'confirming', 'idle']);
  const turnIndex = api.requests.findIndex((request) => request.path.endsWith('/turns'));
  const idleIndex = api.requests.findIndex((request) => request.path.endsWith('/actions') && (request.body as { action: { phase?: string } }).action.phase === 'idle');
  expect(idleIndex).toBeLessThan(turnIndex);
  const turn = api.requests.find((request) => request.path.endsWith('/turns'))!.body as { input: { source: string; transcriptionId: string } };
  expect(turn.input).toMatchObject({ source: 'stt', transcriptionId: 'tx-1' });
});

test('microphone denial offers the same-panel typed fallback', async ({ page }) => {
  await fakeMedia(page, { deny: true });
  const api = await installScriptedApi(page);
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Start recording' }).click();
  await expect(panel.getByRole('alert')).toContainText('Microphone access was blocked');
  await panel.getByRole('button', { name: 'Type instead' }).click();
  await expect(panel.getByRole('textbox')).toBeVisible();
  expect(phases(api)).toEqual([]);
  expect(api.failures).toEqual([]);
});

test('recording stops by itself at 15 seconds', async ({ page }) => {
  await fakeMedia(page);
  await page.clock.install();
  const api = await installScriptedApi(page);
  await transcribeAs(page, '你好');
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Start recording' }).click();
  await expect(panel.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.clock.fastForward(15_001);
  await expect(panel.getByRole('textbox')).toHaveValue('你好');
  expect(phases(api).map((action) => action.phase)).toEqual(['recording', 'transcribing', 'confirming']);
});

test('reply audio waits for the job, plays once, and replay never renews its lifecycle', async ({ page }) => {
  await fakeMedia(page);
  const api = await installScriptedApi(page);
  await speechTurns(page, api);
  let polls = 0;
  await page.route('**/api/sessions/*/speech/*', async (route) => {
    polls++;
    if (polls === 1) return route.fulfill({ status: 202, headers: { 'Retry-After': '0' }, json: { status: 'pending' } });
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: { 'X-Asset-Duration-Ms': '900' }, body: Buffer.from('ID3fake') });
  });
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Use typed Mandarin' }).click();
  await page.evaluate(() => { (window as unknown as Record<string, boolean>).__holdPlayback = true; });
  await panel.getByRole('textbox').fill('请给我一杯茶。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  const controls = page.getByTestId('audio-controller');
  await expect(controls).toContainText('Playing reply');
  // NPC speech is interruptible: the mic stays live while the reply plays (see barge-in test).
  await expect(panel.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  await page.evaluate(() => { (window as unknown as Record<string, boolean>).__holdPlayback = false; });
  await expect(controls).toContainText('Audio ready');
  expect(polls).toBe(2);
  await page.getByLabel('Settings', { exact: true }).click();
  await controls.getByRole('button', { name: 'Replay' }).click();
  await expect.poll(() => counter(page, '__plays')).toBe(2);
  await expect(controls.getByRole('button', { name: 'Replay' })).toBeEnabled();
  expect(phases(api).map((action) => `${action.operationId}:${action.phase}`)).toEqual(['speech-1:playing', 'speech-1:idle']);
});

test('pressing the mic interrupts the reply and records only after the speech operation ends', async ({ page }) => {
  await fakeMedia(page);
  const api = await installScriptedApi(page);
  await speechTurns(page, api);
  await page.route('**/api/sessions/*/speech/*', (route) => route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: { 'X-Asset-Duration-Ms': '900' }, body: Buffer.from('ID3fake') }));
  await transcribeAs(page, '谢谢');
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Use typed Mandarin' }).click();
  await page.evaluate(() => { (window as unknown as Record<string, boolean>).__holdPlayback = true; });
  await panel.getByRole('textbox').fill('请给我一杯茶。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  const controls = page.getByTestId('audio-controller');
  await expect(controls).toContainText('Playing reply');
  await panel.getByRole('button', { name: 'Start recording' }).click();
  await expect(panel.getByTestId('recorder')).toContainText('Listening…');
  await expect(controls).toContainText('Audio stopped');
  await panel.getByRole('button', { name: 'Stop recording' }).click();
  await expect.poll(() => phases(api).map((action) => `${action.operationId === 'speech-1' ? 'speech' : 'mic'}:${action.phase}`)).toEqual(['speech:playing', 'speech:idle', 'mic:recording', 'mic:transcribing', 'mic:confirming']);
  expect(api.failures).toEqual([]);
});

test('restarting during a pending reply drops the old audio', async ({ page }) => {
  await fakeMedia(page);
  const steps: Step[] = [{ action: { type: 'retryMission' } }];
  const api = await installScriptedApi(page, { steps });
  await speechTurns(page, api, 'speech-old');
  let release = false;
  await page.route('**/api/sessions/*/speech/*', async (route) => release
    ? route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('ID3fake') })
    : route.fulfill({ status: 202, headers: { 'Retry-After': '0' }, json: { status: 'pending' } }));
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Use typed Mandarin' }).click();
  await panel.getByRole('textbox').fill('请给我一杯茶。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(page.getByTestId('audio-controller')).toContainText('Preparing reply audio');
  await page.getByRole('button', { name: 'Restart quest' }).click();
  release = true;
  await page.waitForTimeout(500);
  expect(await counter(page, '__plays')).toBe(0);
  expect(phases(api)).toEqual([]);
  expect(api.remaining()).toBe(0);
});

test('deferred turn: retry never waits for Gemini, the old reply stays silent, and failed-turn recovery reuses one turn', async ({ page }) => {
  await fakeMedia(page);
  const api = await installScriptedApi(page, { steps: [{ action: { type: 'retryMission' } }] });
  const turns: { turnId: string; expectedVersion: number }[] = [];
  const speechFetches: string[] = [];
  let releaseOld!: () => void;
  const held = new Promise<void>((resolve) => { releaseOld = resolve; });
  let oldAnswered = false;
  await page.route('**/api/sessions/*/speech/*', (route) => {
    speechFetches.push(new URL(route.request().url()).pathname.split('/').pop()!);
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', headers: { 'X-Asset-Duration-Ms': '900' }, body: Buffer.from('ID3fake') });
  });
  await page.route('**/api/sessions/*/turns', async (route) => {
    const input = TurnRequestSchema.parse(route.request().postDataJSON());
    turns.push(input);
    if (turns.length === 1) { // slow Gemini turn from the abandoned attempt
      const before = api.state();
      await held;
      oldAnswered = true;
      return route.fulfill({ json: TurnResponseSchema.parse({ turnId: input.turnId, state: { ...before, version: before.version + 1 }, events: [], npcReply: '旧的回复。', speechId: 'speech-old' }) });
    }
    api.patch({ version: api.state().version + 1 }); // provider bookkeeping advances the version either way
    if (turns.length === 2) return route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'The language provider is unavailable. Retry this turn.', retryable: true } } });
    return route.fulfill({ json: TurnResponseSchema.parse({ turnId: input.turnId, state: api.state(), events: [], npcReply: '新的回复。', speechId: 'speech-new' }) });
  });
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Use typed Mandarin' }).click();
  await panel.getByRole('textbox').fill('请给我一杯茶。');
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect.poll(() => turns.length).toBe(1);

  // Retry while Gemini is still pending: the retry commits without waiting for the turn.
  await page.getByRole('button', { name: 'Restart quest' }).click();
  await expect.poll(() => api.remaining()).toBe(0);
  const retried = api.requests.find((request) => (request.body as { action?: { type: string } } | null)?.action?.type === 'retryMission');
  expect(retried).toBeTruthy();
  expect(oldAnswered).toBe(false);
  const attemptVersion = api.state().version;

  // The old reply lands in the new attempt: it is neither shown nor fetched nor played.
  releaseOld();
  await expect.poll(() => oldAnswered).toBe(true);
  await page.waitForTimeout(500);
  await expect(page.getByText('旧的回复。')).toHaveCount(0);
  expect(speechFetches).toEqual([]);
  expect(await counter(page, '__plays')).toBe(0);
  expect(phases(api)).toEqual([]);

  // A failed turn in the new attempt recovers with the same turn ID and a refreshed version.
  const fresh = page.getByTestId('dialogue-panel');
  if (!(await fresh.isVisible())) await page.getByRole('button', { name: '小林 · Talk', exact: true }).click();
  if (await fresh.getByRole('button', { name: 'Use typed Mandarin' }).isVisible()) await fresh.getByRole('button', { name: 'Use typed Mandarin' }).click();
  await fresh.getByRole('textbox').fill('请给我一杯茶。');
  await fresh.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(page.getByTestId('recovery-panel')).toContainText('Retry this turn.');
  await page.getByRole('button', { name: 'Retry request' }).click();
  await expect(fresh.getByTestId('npc-reply')).toContainText('新的回复。');
  expect(turns).toHaveLength(3);
  expect(turns[2].turnId).toBe(turns[1].turnId);
  expect(turns[1].turnId).not.toBe(turns[0].turnId);
  expect(turns[1].expectedVersion).toBe(attemptVersion);
  expect(turns[2].expectedVersion).toBe(attemptVersion + 1);
  await expect.poll(() => speechFetches).toEqual(['speech-new']);
  expect(api.failures).toEqual([]);
});
