import { expect, test } from '@playwright/test';
import { harness } from './helpers';

// Edge journeys against the real server through the developer harness (fixture dialogue).

test('Q1: ambiguous requests clarify and completed quests cannot restart or purchase again', async ({ request }) => {
  const h = await harness(request);
  await h.goto(h.state.position);
  const vendor = h.anchor((entry) => entry.role === 'vendor' && entry.label === '老王');
  await h.goto(vendor.position);
  const unclear = await h.talk(vendor.id, 'vendor', '嗯……那个');
  expect(unclear.npcReply).toMatch(/[茶水]/); // the clarification names the available drinks
  await h.act({ type: 'choose', choiceId: 'q1.pay', anchorId: vendor.id }, 422); // no drink ordered yet
  await h.talk(vendor.id, 'vendor', '我要水。');
  await h.act({ type: 'choose', choiceId: 'q1.pay', anchorId: vendor.id });
  expect(h.state).toMatchObject({ status: 'cleared', inventory: { cny: 15, drinks: ['water'] } });
  const rewarded = { xp: h.state.xp, badges: h.state.badges };

  const rejected = await h.act({ type: 'startMission', missionId: 'Q1' }, 422);
  expect(rejected.error.code).toBe('ACTION_FORBIDDEN');
  await h.act({ type: 'choose', choiceId: 'q1.pay', anchorId: vendor.id }, 422);
  expect(h.state).toMatchObject({ status: 'cleared', inventory: { cny: 15, drinks: ['water'] } });
  expect(h.state.purchases).toHaveLength(1);
  expect({ xp: h.state.xp, badges: h.state.badges }).toEqual(rewarded);
});

test('Q3 is locked until Q2, and a capture without an accepted photo request is rejected', async ({ request }) => {
  const h = await harness(request);
  await h.act({ type: 'startMission', missionId: 'Q3' }, 422); // locked until Q2
  const forged = await h.act({ type: 'photoCapture', photoRequestId: 'forged-1', outcome: 'captured', imageDigest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' }, 422);
  expect(forged.error.code).toBe('ACTION_FORBIDDEN');
  expect(h.state.status).toBe('active');
});
