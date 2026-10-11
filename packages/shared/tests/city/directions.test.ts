import { describe, expect, it, vi } from 'vitest';
import type { ChunkCoord, Road } from '../../src/city/contracts.js';

vi.mock('../../src/city/catalog/index.js', async () => (await import('./fake-city.js')).fakeCatalogModule);
// Planner stand-in: every chunk has 南京路 east-west at z = 20 and 四川路 north-south on its west edge.
vi.mock('../../src/city/planner.js', () => ({
  worldLayout: () => ({ spawn: { x: 20, z: 22 }, hotel: { coord: { cx: 1, cz: 1 }, anchorId: 'hotel.grand', local: { x: 20, z: 24 } }, river: { axis: 'z', center: 150, width: 30 } }),
  planChunk: (_seed: string, coord: ChunkCoord) => ({ coord, district: 'shopping', connectors: [], water: [], requiredAnchors: [], neighbours: {}, roads: plannerRoads() }),
}));
function plannerRoads(): Road[] {
  return [{ id: 'r.ew', kind: 'avenue', from: { x: 0, z: 20 }, to: { x: 40, z: 20 }, width: 10, nameKey: 'nanjing' }, { id: 'r.ns', kind: 'street', from: { x: 0, z: 0 }, to: { x: 0, z: 40 }, width: 8, nameKey: 'sichuan' }];
}
const { routeToHotel } = await import('../../src/city/directions.js');
const { sealManifest } = await import('../../src/city/hash.js');
const { manifest, plan } = await import('./fake-city.js');
const { TEXT_CATALOG } = await import('../../src/city/text-catalog.js');

const committed = (coord: ChunkCoord, over = {}) => sealManifest(manifest(plan({ coord, roads: plannerRoads() }), over));

describe('routeToHotel', () => {
  it('describes a truthful few-turn route over real roads ending at the hotel', () => {
    const directions = routeToHotel('seed', new Map(), { id: 'guide.1', position: { x: 10, z: 22 } })!;
    expect(directions.textZh).toBe('沿着南京路往东走，到四川路右转，往南走，到南京路左转，往东走，上海大酒店在右边。');
    expect(directions.steps.map((s) => s.english)).toEqual(['Walk east along Nanjing Road', 'Turn right onto Sichuan Road and head south', 'Turn left onto Nanjing Road and head east', 'Shanghai Grand Hotel is on your right']);
    expect(directions.hotelAnchorId).toBe('hotel.grand');
    // Every named road exists in the street graph.
    const names = new Set(plannerRoads().map((r) => TEXT_CATALOG['road-name'][r.nameKey as 'nanjing'].zh));
    for (const match of directions.textZh.matchAll(/[一-鿿]+路/g)) expect(names.has(match[0].replace(/^(沿着|到)/, ''))).toBe(true);
    expect(routeToHotel('seed', new Map(), { id: 'guide.1', position: { x: 10, z: 22 } })).toEqual(directions);
  });
  it('uses committed roads and nearby committed landmarks', () => {
    const chunks = new Map([['0,0', committed({ cx: 0, cz: 0 }, { anchors: [{ id: 'metro.1', placementId: 'p', capability: 'readable-sign', kind: 'landmark', nameKey: 'metro', x: 38, z: 18 }] })]]);
    expect(routeToHotel('seed', chunks, { id: 'g', position: { x: 10, z: 22 } })!.textZh).toContain('到四川路右转（地铁站旁边）');
  });
  it('returns null when the hotel is off the committed street network', () => {
    const noRoads = new Map([['1,1', sealManifest(manifest(plan({ coord: { cx: 1, cz: 1 }, roads: [] })))], ['1,0', sealManifest(manifest(plan({ coord: { cx: 1, cz: 0 }, roads: [] })))]]);
    expect(routeToHotel('seed', noRoads, { id: 'g', position: { x: 10, z: 22 } })).toBeNull();
  });
});
