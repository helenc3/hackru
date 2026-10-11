import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { GameAction, PublicState } from '@vibequest/shared';

const HARNESS = process.env.E2E_HARNESS_URL ?? 'http://127.0.0.1:4175';

async function walk(page: Page, key: string, axis: 'x' | 'z', destination: number, direction: number) {
  const world = page.getByTestId('world-renderer');
  await world.focus();
  const code = `Key${key.toUpperCase()}`;
  // Release inside the animation loop so protocol latency cannot overshoot a target.
  const stopped = world.evaluate((root, options) => new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + 15000;
    const release = () => root.dispatchEvent(new KeyboardEvent('keyup', { code: options.code, bubbles: true }));
    const watch = () => {
      const position = Number(root.getAttribute(`data-position-${options.axis}`));
      if (position * options.direction >= options.destination * options.direction) { release(); resolve(); }
      else if (performance.now() >= deadline) { release(); reject(new Error(`Walking ${options.code} stopped at ${position}`)); }
      else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }), { code, axis, destination, direction });
  await page.keyboard.down(key);
  try { await stopped; } finally { await page.keyboard.up(key); }
}

async function interact(page: Page, targetId: string) {
  const button = page.locator(`[data-target-id="${targetId}"]`);
  await expect(button).toBeEnabled();
  await button.click();
}

async function say(page: Page, text: string) {
  const panel = page.getByTestId('dialogue-panel');
  const typed = panel.getByRole('button', { name: 'Use typed Mandarin', exact: true });
  if (await typed.count()) await typed.click();
  const before = await panel.getByTestId('npc-reply').count() ? await panel.getByTestId('npc-reply').innerText() : '';
  await panel.getByRole('textbox').fill(text);
  await panel.getByRole('button', { name: 'Send Mandarin' }).click();
  await expect(panel.getByRole('textbox')).toHaveValue('');
  await expect.poll(async () => await panel.getByTestId('npc-reply').count() ? panel.getByTestId('npc-reply').innerText() : '').not.toBe(before);
}

/** The developer harness path: same semantic actions through the validation API, no world. */
async function harnessP1(request: APIRequestContext): Promise<PublicState> {
  let state: PublicState = (await (await request.post(`${HARNESS}/api/sessions`, { data: { initialTier: 0, providerMode: 'fixture', validationMode: true, inputPreference: 'typed-accessibility' } })).json()).state;
  let n = 0;
  const post = async (path: string, data: object) => {
    const response = await request.post(`${HARNESS}/api/sessions/${state.sessionId}/${path}`, { data: { ...data, expectedVersion: state.version } });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(200);
    state = (await response.json()).state;
  };
  const act = (action: GameAction) => post('actions', { actionId: `h-${++n}`, action });
  const talk = (text: string) => post('turns', { turnId: `h-${++n}`, npcId: 'xiaolin', input: { text, source: 'typed' } });
  await act({ type: 'moveZone', zoneId: 'cafe' });
  await act({ type: 'inspect', targetId: 'p1.entrance-sign' });
  await act({ type: 'choose', choiceId: 'p1.enter-plaza-door' });
  for (const line of ['我要咖啡。', '那就茶吧。', '茶十元。']) await talk(line);
  await act({ type: 'choose', choiceId: 'p1.pay-cafe' });
  await act({ type: 'playCue', cueId: 'p1.station-directions', channel: 'validation-text' });
  await act({ type: 'moveZone', zoneId: 'concourse' });
  return state;
}

const comparable = (state: PublicState) => ({ missionId: state.missionId, status: state.status, objectives: state.objectives, inventory: state.inventory, xp: state.xp, badges: state.badges, unlockedMissionIds: state.unlockedMissionIds });

test('player world clears the café mission against the real server and matches the harness result', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Conversation provider').selectOption('fixture');
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-position-z', /./);
  await expect(page.getByText('Fixture demonstration · scripted responses')).toBeVisible();
  await expect(page.locator('[data-testid="validation-harness"]')).toHaveCount(0);

  // Read the sign, then act on it: the plaza door.
  await walk(page, 'w', 'z', 6.1, -1);
  await walk(page, 'a', 'x', -9.8, -1);
  await interact(page, 'p1.entrance-sign');
  await expect(page.getByRole('dialog', { name: 'Inspected sign' })).toContainText('请从广场进入');
  await page.keyboard.press('Escape');
  await interact(page, 'p1.enter-plaza-door');

  // Order through the in-world dialogue panel; the coffee substitution is authored.
  await walk(page, 'w', 'z', 4.1, -1);
  await interact(page, 'xiaolin');
  for (const line of ['我要咖啡。', '那就茶吧。', '茶十元。']) await say(page, line);
  await page.getByTestId('dialogue-panel').getByRole('button', { name: 'Close conversation' }).click();
  await interact(page, 'p1.pay-cafe');

  // Spoken directions (Chinese subtitle channel keeps this deterministic), then walk there.
  await page.getByRole('region', { name: 'World interactions' }).getByRole('button', { name: 'Chinese subtitles' }).click();
  await page.getByRole('button', { name: 'Close sign' }).click();
  await walk(page, 'w', 'z', 1.9, -1); // Concourse starts at z=2; clearing freezes movement.
  await expect(page.getByTestId('result-panel')).toContainText('You found your way.');

  const sessionId = await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'));
  const world: PublicState = (await (await request.get(`/api/sessions/${sessionId}`)).json()).state;
  expect(world).toMatchObject({ validationMode: false, providerStatus: 'fixture', status: 'cleared' });
  expect(comparable(world)).toEqual(comparable(await harnessP1(request)));
});

test('production refuses the harness and validation sessions', async ({ page, request }) => {
  expect((await request.post('/api/sessions', { data: { initialTier: 0, providerMode: 'fixture', validationMode: true } })).status()).toBe(422);
  await page.goto('/__validation');
  await expect(page.getByText('The validation harness is unavailable.')).toBeVisible();
});

test('production serves UI, API and reviewed PA assets from one origin', async ({ request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health).toMatchObject({ status: 'ok', specVersion: '1.2', features: { validationHarness: false, fixtures: true } });
  expect((await request.get('/')).headers()['content-type']).toContain('text/html');
  const pa = await request.get('/audio/p1.station-directions.tier-0.mp3');
  expect(pa.status()).toBe(200);
  expect(pa.headers()['content-type']).toContain('audio/mpeg');
  expect((await request.get('/api/nope')).status()).toBe(404);
  expect((await request.get('/audio/missing.mp3')).status()).toBe(404);
});
