import type { Anchor, Directions, Position, WorldView } from '../../src/index.js';

type WorldAnchor = Anchor & { position: Position; chunk: string };
const anchor = (id: string, position: Position, rest: Omit<Anchor, 'id' | 'placementId' | 'x' | 'z'>): WorldAnchor =>
  ({ id, placementId: `p.${id}`, x: ((position.x % 40) + 40) % 40, z: ((position.z % 40) + 40) % 40, position, chunk: `${Math.floor(position.x / 40)},${Math.floor(position.z / 40)}`, ...rest });

export const anchors: WorldAnchor[] = [
  anchor('a.vendor', { x: 0, z: 2 }, { capability: 'drink-vendor', kind: 'npc', role: 'vendor', nameKey: 'xiaolin' }),
  anchor('a.vendor2', { x: 30, z: 0 }, { capability: 'drink-vendor', kind: 'npc', role: 'vendor', nameKey: 'laowang' }),
  anchor('a.menu', { x: 1, z: 2 }, { capability: 'readable-sign', kind: 'sign', cueId: 'q1.menu' }),
  anchor('a.guide', { x: 5, z: 0 }, { capability: 'direction-helper', kind: 'npc', role: 'guide', nameKey: 'achen' }),
  anchor('a.guide2', { x: 10, z: 10 }, { capability: 'direction-helper', kind: 'npc', role: 'guide' }),
  anchor('hotel.grand', { x: 80, z: 80 }, { capability: 'hotel-landmark', kind: 'landmark', nameKey: 'grand-hotel' }),
  anchor('a.passerby', { x: 150, z: 0 }, { capability: 'photo-passerby', kind: 'npc', role: 'passerby', nameKey: 'xiaomei' }),
  anchor('a.view', { x: 155, z: 0 }, { capability: 'river-viewpoint', kind: 'photo-spot', nameKey: 'viewpoint' }),
  anchor('a.lonely', { x: 200, z: 60 }, { capability: 'photo-passerby', kind: 'npc', role: 'passerby' }),
];
export const route: Directions = { routeId: 'route-1', fromAnchorId: 'a.guide', hotelAnchorId: 'hotel.grand', textZh: '沿着南京路往东走，到四川路左转，上海大酒店在右边。', steps: [{ textZh: '沿着南京路往东走', english: 'Walk east along Nanjing Road.' }, { textZh: '到四川路左转', english: 'Turn left at Sichuan Road.' }, { textZh: '上海大酒店在右边', english: 'The hotel is on the right.' }] };
const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);

/** Committed land everywhere with x < 500; only a.guide knows a verified route. */
export const fakeWorld: WorldView = {
  worldId: 'world-test',
  walkable: (p) => p.x < 500,
  committed: () => true,
  districtAt: (p) => p.x > 140 ? 'waterfront' : 'shopping',
  anchor: (id) => anchors.find((entry) => entry.id === id),
  anchorsNear: (p, radius) => anchors.filter((entry) => dist(entry.position, p) <= radius),
  directionsToHotel: (id) => id === 'a.guide' ? route : null,
};
