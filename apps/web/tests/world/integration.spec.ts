import { expect, test } from '@playwright/test';
import { installScriptedApi } from '../../../../fixtures/ui/scripted-api';

test('shared app sign panel pauses movement and Escape restores world focus', async ({ page }) => {
  const api = await installScriptedApi(page, { steps: [
    { action: { type: 'inspect', targetId: 'p1.entrance-sign' }, patch: { visibleCues: [{ id: 'p1.entrance-sign', label: '入口告示', text: '请从广场进入。这扇门关闭了。' }] } },
  ] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Practice', exact: true }).click();
  const world = page.getByTestId('world-renderer');
  await expect(world).toHaveAttribute('data-position-z', /./);
  await page.getByRole('button', { name: '入口告示 · Read sign' }).click();
  const panel = page.getByRole('dialog', { name: 'Inspected sign' });
  await expect(panel).toContainText('请从广场进入');
  await expect(panel.getByRole('button', { name: 'Close sign' })).toBeFocused();
  const position = await world.getAttribute('data-position-z');
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  await expect(world).toHaveAttribute('data-position-z', position!);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(world).toBeFocused();
  await page.keyboard.down('s');
  try { await expect.poll(async () => Number(await world.getAttribute('data-position-z'))).toBeGreaterThan(Number(position) + .2); }
  finally { await page.keyboard.up('s'); }
  expect(api.remaining()).toBe(0);
  expect(api.failures).toEqual([]);
  expect(api.requests.filter((request) => (request.body as { action?: { type?: string } })?.action?.type === 'inspect')).toHaveLength(1);
});
