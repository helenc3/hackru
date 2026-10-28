import { expect, it } from 'vitest';
import { AutoEngage } from '../../src/world/auto-engage';
import type { PublicState } from '@vibequest/shared';

const state: Pick<PublicState, 'interactables'> = { interactables: [
  { id: 'pay', kind: 'choice', label: 'Pay', position: { x: 0, z: 0 } },
  { id: 'wang', kind: 'npc', role: 'vendor', label: '老王', position: { x: 1, z: 0 } },
  { id: 'other', kind: 'npc', role: 'vendor', label: 'Other', position: { x: 1.5, z: 0 } },
] };
it('auto-engages the closest NPC, never payments, and respects blocking UI', () => {
  const gate = new AutoEngage();
  expect(gate.candidate(state, { x: 0, z: 0 }, true)).toBeUndefined();
  expect(gate.candidate(state, { x: 0, z: 0 }, false)).toBe('wang');
  expect(gate.candidate(state, { x: -2, z: 0 }, false)).toBeUndefined();
});
it('closing stays closed through edge jitter and overlapping NPCs; walking away rearms entry', () => {
  const gate = new AutoEngage(); gate.engaged(state, { x: 0, z: 0 });
  expect(gate.candidate(state, { x: 0, z: 0 }, false)).toBeUndefined();
  gate.candidate(state, { x: -1.1, z: 0 }, false);
  expect(gate.candidate(state, { x: 0, z: 0 }, false)).toBeUndefined();
  gate.candidate(state, { x: -3, z: 0 }, false);
  expect(gate.candidate(state, { x: 0, z: 0 }, false)).toBe('wang');
  gate.engaged(state, { x: 0, z: 0 }); gate.reset();
  expect(gate.candidate(state, { x: 0, z: 0 }, false)).toBe('wang');
});

it('walking away rearms an NPC even when its chunk/anchor is no longer projected', () => {
  const gate = new AutoEngage(); gate.engaged(state, { x: 0, z: 0 });
  gate.candidate({ interactables: [] }, { x: 50, z: 0 }, false);
  expect(gate.candidate(state, { x: 0, z: 0 }, false)).toBe('wang');
});
