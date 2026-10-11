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

async function talk(page: Page, npcId: string, lines: string[]) {
  await interact(page, npcId);
  for (const line of lines) await say(page, line);
  await page.getByTestId('dialogue-panel').getByRole('button', { name: 'Close conversation' }).click();
}

/** Chinese subtitles keep PA delivery deterministic in headless browsers. */
async function subtitles(page: Page, text: string) {
  await page.getByRole('region', { name: 'World interactions' }).getByRole('button', { name: 'Chinese subtitles' }).click();
  await expect(page.getByRole('dialog', { name: 'Inspected sign' })).toContainText(text);
  await page.getByRole('button', { name: 'Close sign' }).click();
}

async function readSign(page: Page, targetId: string, text: string) {
  await interact(page, targetId);
  await expect(page.getByRole('dialog', { name: 'Inspected sign' })).toContainText(text);
  await page.keyboard.press('Escape');
}

const worldState = async (page: Page, request: APIRequestContext): Promise<PublicState> => {
  const sessionId = await page.evaluate(() => localStorage.getItem('vibequest.player-session.v1'));
  return (await (await request.get(`/api/sessions/${sessionId}`)).json()).state;
};

async function playP1(page: Page) {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Conversation provider' }).click();
  await page.getByRole('option', { name: 'Fixture demonstration · scripted', exact: true }).click();
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  await page.getByRole('button', { name: "Let's play", exact: true }).click();
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-position-z', /./);
  await walk(page, 'w', 'z', 6.1, -1);
  await walk(page, 'a', 'x', -9.8, -1);
  await readSign(page, 'p1.entrance-sign', '请从广场进入');
  await interact(page, 'p1.enter-plaza-door');
  await walk(page, 'w', 'z', 4.1, -1);
  await talk(page, 'xiaolin', ['我要咖啡。', '那就茶吧。', '茶十元。']);
  await interact(page, 'p1.pay-cafe');
  await subtitles(page, '');
  await walk(page, 'w', 'z', 1.9, -1);
  await expect(page.getByTestId('result-panel')).toContainText('You found your way.');
}

/** P2 from the concourse centre (0,0); optionally boards the stale platform 2 first. */
async function playP2(page: Page, wrongFirst: boolean) {
  await page.getByRole('button', { name: 'Next practice mission' }).click();
  await expect(page.getByTestId('quest-panel')).toContainText('The platform changed');
  await readSign(page, 'p2.timetable', '江滨');
  await walk(page, 'a', 'x', -1.5, -1);
  await talk(page, 'achen', ['去江滨的车在哪个站台？']);
  await walk(page, 'w', 'z', -1, -1);
  await subtitles(page, '三号站台');
  if (wrongFirst) {
    await walk(page, 'd', 'x', 0, 1);
    await walk(page, 'w', 'z', -10.5, -1);
    await interact(page, 'p2.board-2');
    await expect(page.getByLabel('Mission updates')).toContainText('这趟车去机场。');
    await expect(page.getByTestId('result-panel')).toHaveCount(0);
    await walk(page, 's', 'z', -5, 1); // Platforms 2 and 3 only connect through the concourse.
  }
  await walk(page, 'd', 'x', 10, 1);
  await walk(page, 'w', 'z', -10.5, -1);
  await interact(page, 'p2.board-3');
  await expect(page.getByTestId('result-panel')).toContainText('You found your way.');
}

/** B1 from (0,0) through the paid ticket and the harbour PA; ends at (1.5, -1). */
async function prepareBoss(page: Page) {
  await page.getByRole('button', { name: 'Enter boss mission' }).click();
  await expect(page.getByTestId('quest-panel')).toContainText('Boss · active');
  await readSign(page, 'b1.destination-board', '海港');
  await walk(page, 'd', 'x', 1.5, 1);
  await talk(page, 'laozhou', ['我要一张去海港的票。', '海港，一张。']);
  await interact(page, 'b1.pay-ticket');
  await walk(page, 'w', 'z', -1, -1);
  await subtitles(page, '二号站台');
}

async function harnessCampaign(request: APIRequestContext): Promise<PublicState> {
  let state: PublicState = (await (await request.post(`${HARNESS}/api/sessions`, { data: { initialTier: 0, providerMode: 'fixture', validationMode: true, inputPreference: 'typed-accessibility' } })).json()).state;
  let n = 0;
  const post = async (path: string, data: object) => {
    const response = await request.post(`${HARNESS}/api/sessions/${state.sessionId}/${path}`, { data: { ...data, expectedVersion: state.version } });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(200);
    state = (await response.json()).state;
  };
  const act = (action: GameAction) => post('actions', { actionId: `h-${++n}`, action });
  const talkTo = (npcId: string, text: string) => post('turns', { turnId: `h-${++n}`, npcId, input: { text, source: 'typed' } });
  await act({ type: 'moveZone', zoneId: 'cafe' });
  await act({ type: 'inspect', targetId: 'p1.entrance-sign' });
  await act({ type: 'choose', choiceId: 'p1.enter-plaza-door' });
  for (const line of ['我要咖啡。', '那就茶吧。', '茶十元。']) await talkTo('xiaolin', line);
  await act({ type: 'choose', choiceId: 'p1.pay-cafe' });
  await act({ type: 'playCue', cueId: 'p1.station-directions', channel: 'validation-text' });
  await act({ type: 'moveZone', zoneId: 'concourse' });
  await act({ type: 'startMission', missionId: 'P2' });
  await act({ type: 'inspect', targetId: 'p2.timetable' });
  await talkTo('achen', '去江滨的车在哪个站台？');
  await act({ type: 'playCue', cueId: 'p2.platform-change', channel: 'validation-text' });
  await act({ type: 'moveZone', zoneId: 'platform-2' });
  await act({ type: 'choose', choiceId: 'p2.board-2' });
  await act({ type: 'moveZone', zoneId: 'concourse' });
  await act({ type: 'moveZone', zoneId: 'platform-3' });
  await act({ type: 'choose', choiceId: 'p2.board-3' });
  await act({ type: 'startMission', missionId: 'B1' });
  await act({ type: 'inspect', targetId: 'b1.destination-board' });
  for (const line of ['我要一张去海港的票。', '海港，一张。']) await talkTo('laozhou', line);
  await act({ type: 'choose', choiceId: 'b1.pay-ticket' });
  await act({ type: 'playCue', cueId: 'b1.harbor-change', channel: 'validation-text' });
  await act({ type: 'moveZone', zoneId: 'platform-2' });
  await act({ type: 'choose', choiceId: 'b1.board-2' });
  return state;
}

const comparable = (state: PublicState) => ({ missionId: state.missionId, status: state.status, objectives: state.objectives, inventory: state.inventory, xp: state.xp, badges: state.badges, unlockedMissionIds: state.unlockedMissionIds });

test('player world clears P1, P2 with a repaired wrong boarding, and the boss, matching the harness campaign', async ({ page, request }) => {
  test.setTimeout(180_000);
  await playP1(page);
  await playP2(page, true);
  await prepareBoss(page);

  // Boss is independent: no coaching, hints, freeze or answer chips in the world, and the server refuses them.
  await expect(page.getByTestId('coach-panel')).toHaveCount(0);
  const inventory = page.getByTestId('inventory-bar');
  await expect(inventory.getByRole('button', { name: /Hint|Freeze|Pause/ })).toHaveCount(0);
  await expect(page.locator('[data-testid*="chip"], [class*="answer"]')).toHaveCount(0);
  const boss = await worldState(page, request);
  expect(boss).toMatchObject({ missionId: 'B1', mode: 'boss', status: 'active', capabilities: { coach: false, hints: false, freeze: false } });
  for (const [i, action] of ([{ type: 'useItem', item: 'hint' }, { type: 'useItem', item: 'freeze' }, { type: 'pausePractice' }] as GameAction[]).entries()) {
    const refused = await request.post(`/api/sessions/${boss.sessionId}/actions`, { data: { actionId: `boss-refusal-${i}`, expectedVersion: boss.version, action } });
    expect(refused.status(), JSON.stringify(action)).toBe(422);
  }
  expect((await worldState(page, request)).version).toBe(boss.version);

  await walk(page, 'w', 'z', -11, -1);
  await interact(page, 'b1.board-2');
  await expect(page.getByTestId('result-panel')).toContainText('Station Navigator');

  const world = await worldState(page, request);
  expect(world).toMatchObject({ validationMode: false, providerStatus: 'fixture', missionId: 'B1', status: 'cleared', badges: ['station-navigator'] });
  const harness = await harnessCampaign(request);
  // The repair followed subtitle-assisted PA, so neither path earns the +20 independent-repair XP.
  expect(comparable(world)).toEqual(comparable(harness));
});

test('boss failure offers retry and targeted practice; retry is a fresh attempt without duplicate rewards', async ({ page, request }) => {
  test.setTimeout(180_000);
  await playP1(page);
  await playP2(page, false);
  await prepareBoss(page);
  // Platform 1 was the stale board entry; the announcement moved the train to platform 2.
  await walk(page, 'a', 'x', -9, -1);
  await walk(page, 'w', 'z', -11, -1);
  await interact(page, 'b1.board-1');
  const result = page.getByTestId('result-panel');
  await expect(result).toContainText('Try a fresh route.');
  await expect(result.getByRole('button', { name: 'Return to practice' })).toBeVisible();
  const failed = await worldState(page, request);
  expect(failed).toMatchObject({ missionId: 'B1', status: 'failed', badges: [] });

  await result.getByRole('button', { name: 'Retry mission' }).click();
  await expect(result).toHaveCount(0);
  const retry = await worldState(page, request);
  expect(retry).toMatchObject({ missionId: 'B1', status: 'active', zoneId: 'concourse', xp: failed.xp, inventory: failed.inventory, badges: [] });
  expect(retry.objectives.every((objective) => !objective.complete)).toBe(true);
  // The avatar restarts where the server put it, so the fresh attempt is playable.
  await expect(page.getByTestId('world-renderer')).toHaveAttribute('data-position-x', '0.000');
  await walk(page, 'w', 'z', -1, -1);
  await expect(page.getByText('Movement exceeds the authored speed.')).toHaveCount(0);
  expect((await worldState(page, request)).zoneId).toBe('concourse');
});
