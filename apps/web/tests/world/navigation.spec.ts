import { expect, test } from '@playwright/test';
import { WORLD_RULES, createWorldView, type PublicState } from '@vibequest/shared';
import { collides, distance, movePlayer, nearbyTargets, targetAction, walkingPath, zoneAt } from '../../src/world/navigation';
import { fixtureCity } from '../../../../fixtures/world/city';

// The real WorldView over fixture manifests: the same collision code the server validates with.
const manifests = new Map(fixtureCity().map((manifest) => [`${manifest.coord.cx},${manifest.coord.cz}`, manifest]));
const view = createWorldView('fixture-world', 'fixture', manifests);
const spawn = { x: 20, z: 10 };

test('movement keeps the shared speed, camera direction and committed-ground collision', () => {
  expect(distance(spawn, movePlayer(view, spawn, 0, 1, 0, .1))).toBeCloseTo(.4);
  expect(distance(spawn, movePlayer(view, spawn, 1, 1, 0, .1))).toBeCloseTo(.4);
  expect(movePlayer(view, spawn, 0, 1, Math.PI / 2, .1).x).toBeCloseTo(19.6);
  expect(movePlayer(view, spawn, 0, 1, 0, 10).z).toBeCloseTo(9.6); // one frame is capped at 0.1 s
  expect(zoneAt(view, spawn)).toBe('park');
});

test('water blocks, a level bridge crosses, and uncommitted chunks stop the player', () => {
  let position = spawn;
  for (let i = 0; i < 100; i++) position = movePlayer(view, position, 1, 0, 0, .05);
  expect(position.x).toBeLessThan(24 - WORLD_RULES.playerRadius + .01); // creek edge
  expect(collides(view, position)).toBe(false);
  position = { x: 20, z: 20 };
  for (let i = 0; i < 100; i++) position = movePlayer(view, position, 1, 0, 0, .05);
  expect(position.x).toBeGreaterThan(29); // over the bridge deck
  position = { x: 78, z: 10 };
  for (let i = 0; i < 50; i++) position = movePlayer(view, position, 1, 0, 0, .05);
  expect(position.x).toBeLessThan(80); // chunk (2,0) is not committed
});

test('click-to-walk routes around water over the bridge using walkable steps', () => {
  const path = walkingPath(view, spawn, { x: 32, z: 10 });
  expect(path.length).toBeGreaterThan(1);
  expect(path.at(-1)).toEqual({ x: 32, z: 10 });
  expect(path.every((point) => !collides(view, point))).toBe(true);
  expect(path.some((point) => point.z >= 18 && point.z <= 22 && point.x > 24 && point.x < 28)).toBe(true);
  expect(walkingPath(view, spawn, { x: 26, z: 5 })).toEqual([]); // in the creek
});

test('nearby targets use anchor IDs with bounded range and the shared action shapes', () => {
  const at = (x: number, z: number) => ({ x, z });
  const state: Pick<PublicState, 'interactables'> = { interactables: [
    { id: 'a.menu', kind: 'sign', label: '菜单', position: at(20, 6), cueId: 'q1.menu' },
    { id: 'a.vendor', kind: 'npc', role: 'vendor', label: '小林', position: at(21, 6) },
    { id: 'a.pay', kind: 'choice', label: '付款', position: at(22, 6), choiceId: 'q1.pay' },
    { id: 'a.spot', kind: 'photo-spot', label: '拍照点', position: at(10, 10) },
    { id: 'a.hotel', kind: 'landmark', label: '上海大酒店', position: at(20, 6) },
  ] };
  expect(nearbyTargets(state, at(20, 6)).map((target) => target.id)).toEqual(['a.menu', 'a.vendor', 'a.pay']);
  expect(nearbyTargets(state, at(20, 8.001)).map((target) => target.id)).not.toContain('a.menu');
  const [menu, vendor, pay, spot, hotel] = state.interactables;
  expect(targetAction(menu!)).toEqual({ type: 'inspect', targetId: 'a.menu' });
  expect(targetAction(vendor!)).toBeNull();
  expect(targetAction(pay!)).toEqual({ type: 'choose', choiceId: 'q1.pay', anchorId: 'a.pay' });
  expect(targetAction(spot!, { id: 'p1', passerbyAnchorId: 'a.p', viewpointAnchorId: 'a.view', spot: at(10, 10), status: 'accepted', attempts: 0 })).toEqual({ type: 'choose', choiceId: 'q3.start-photo', anchorId: 'a.view' });
  expect(targetAction(hotel!)).toBeNull();
});
