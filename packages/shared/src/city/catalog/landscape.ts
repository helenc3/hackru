import type { CatalogEntry, DistrictKind, ParamSpec, ParamValues, Rect } from '../contracts.js';

// Landscaping kit: street trees, shrubs, planters, parks, and courtyard modules.
// Geometry here is the single source of truth for apps/web/src/city/assets/landscape.tsx.

const num = (params: ParamValues, key: string): number => params[key] as number;
const centered = (w: number, d: number): Rect => ({ minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 });
const all: readonly DistrictKind[] = ['shopping', 'historic', 'residential', 'office', 'waterfront', 'park', 'industrial'];
const scale = (min: number, max: number): ParamSpec => ({ type: 'number', min, max, default: 1, step: 0.05, description: 'Uniform size multiplier.' });
const season: ParamSpec = { type: 'enum', values: ['summer', 'autumn', 'spring'], default: 'summer', description: 'Foliage tint.' };

/** Keep the smallest trees unchanged while making the largest 50% taller. */
export function treeHeightScale(size: number): number {
  return size * (1 + .5 * (size - .7) / .7);
}

/** Trees block only at the trunk; canopies are walk-under and fade in ClearView. */
function tree(id: string, description: string, districts: readonly DistrictKind[], canopy: number, height: number, trunk: number, extra: Record<string, ParamSpec> = {}): CatalogEntry {
  return {
    id, version: 1, component: 'LandscapeTree', category: 'landscape', description, districts,
    params: { scale: scale(0.7, 1.4), season, ...extra }, placement: 'sidewalk',
    footprint: (p) => ({ w: canopy * num(p, 'scale'), d: canopy * num(p, 'scale'), h: height * treeHeightScale(num(p, 'scale')) }),
    collision: (p) => ({ solids: [centered(trunk * 2 * num(p, 'scale'), trunk * 2 * num(p, 'scale'))], walkable: [] }),
    sockets: () => [], clearance: { front: 0.6, side: 0.6 }, capabilities: [],
    lod: { levels: 2, cullDistance: 90 }, cost: { triangles: 900, drawCalls: 2, instanced: true }, review: 'approved',
  };
}

export const landscapeEntries: readonly CatalogEntry[] = [
  tree('ls.tree.plane', 'London plane (法国梧桐), the classic Shanghai street tree: tall pale trunk, broad layered canopy.', ['shopping', 'historic', 'residential', 'office', 'park'], 4.2, 7, 0.28,
    { variant: { type: 'enum', values: ['round', 'tall'], default: 'round', description: 'Canopy shape.' } }),
  tree('ls.tree.camphor', 'Camphor tree: short trunk, dense dark-green dome; shades courtyards and compounds.', ['residential', 'park', 'office', 'industrial'], 4.6, 5.5, 0.3),
  tree('ls.tree.willow', 'Weeping willow with drooping curtain foliage; lines creeks and the riverside.', ['waterfront', 'park', 'historic'], 3.8, 5, 0.22),
  tree('ls.tree.osmanthus', 'Small osmanthus tree with golden blossom clusters; lane corners and shopfronts.', ['historic', 'shopping', 'residential', 'park'], 2.6, 4, 0.2,
    { bloom: { type: 'boolean', default: true, description: 'Show golden blossom.' } }),
  {
    id: 'ls.shrub.round', version: 1, component: 'LandscapeShrub', category: 'landscape', description: 'Clipped round shrub; pairs at gates or edges planting strips.', districts: all,
    params: { size: { type: 'number', min: 0.6, max: 1.6, default: 1, step: 0.1, description: 'Diameter in metres.' }, flowering: { type: 'boolean', default: false, description: 'Azalea flowers.' } },
    placement: 'ground', footprint: (p) => ({ w: num(p, 'size'), d: num(p, 'size'), h: num(p, 'size') * 0.8 }),
    collision: (p) => ({ solids: [centered(num(p, 'size'), num(p, 'size'))], walkable: [] }),
    sockets: () => [], clearance: { front: 0.3, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 60 }, cost: { triangles: 200, drawCalls: 1, instanced: true }, review: 'approved',
  },
  {
    id: 'ls.shrub.hedge', version: 1, component: 'LandscapeHedge', category: 'landscape', description: 'Boxwood hedge run; divides compound lawns and lines park paths.', districts: ['residential', 'park', 'office', 'historic'],
    params: { length: { type: 'number', min: 2, max: 8, default: 4, step: 0.5, description: 'Run length (x).' }, height: { type: 'number', min: 0.6, max: 1.4, default: 0.9, step: 0.1, description: 'Clipped height.' } },
    placement: 'ground', footprint: (p) => ({ w: num(p, 'length'), d: 0.8, h: num(p, 'height') }),
    collision: (p) => ({ solids: [centered(num(p, 'length'), 0.8)], walkable: [] }),
    sockets: () => [], clearance: { front: 0.4, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 70 }, cost: { triangles: 24, drawCalls: 1, instanced: true }, review: 'approved',
  },
  {
    id: 'ls.planter.box', version: 1, component: 'LandscapePlanter', category: 'landscape', description: 'Raised stone planter on a sidewalk, with flowers, grass, or bamboo.', districts: ['shopping', 'office', 'historic', 'waterfront', 'residential'],
    params: { length: { type: 'number', min: 1, max: 4, default: 2, step: 0.5, description: 'Planter length (x).' }, plant: { type: 'enum', values: ['flowers', 'grass', 'bamboo'], default: 'flowers', description: 'Planting.' } },
    placement: 'sidewalk', footprint: (p) => ({ w: num(p, 'length'), d: 0.9, h: p.plant === 'bamboo' ? 2.4 : 0.9 }),
    collision: (p) => ({ solids: [centered(num(p, 'length'), 0.9)], walkable: [] }),
    sockets: () => [], clearance: { front: 0.6, side: 0.2 }, capabilities: [], lod: { levels: 1, cullDistance: 60 }, cost: { triangles: 300, drawCalls: 2, instanced: false }, review: 'approved',
  },
  {
    id: 'ls.park.lawn', version: 1, component: 'LandscapeLawn', category: 'landscape', description: 'Walkable park lawn panel with a soft border; base for park and compound greens.', districts: ['park', 'residential', 'waterfront', 'office'],
    params: { width: { type: 'number', min: 4, max: 20, default: 10, step: 1, description: 'Width (x).' }, depth: { type: 'number', min: 4, max: 20, default: 10, step: 1, description: 'Depth (z).' } },
    placement: 'ground', footprint: (p) => ({ w: num(p, 'width'), d: num(p, 'depth'), h: 0.06 }),
    collision: (p) => ({ solids: [], walkable: [centered(num(p, 'width'), num(p, 'depth'))] }),
    sockets: () => [], clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 120 }, cost: { triangles: 12, drawCalls: 1, instanced: false }, review: 'approved',
  },
  {
    id: 'ls.park.pavilion', version: 1, component: 'LandscapePavilion', category: 'landscape', description: 'Open Chinese garden pavilion (亭) with upturned eaves; walk-through floor, four solid posts.', districts: ['park', 'historic', 'waterfront'],
    params: { size: { type: 'number', min: 3, max: 6, default: 4, step: 0.5, description: 'Square side.' }, roof: { type: 'enum', values: ['tile', 'red'], default: 'tile', description: 'Roof colour scheme.' } },
    placement: 'ground', footprint: (p) => ({ w: num(p, 'size'), d: num(p, 'size'), h: 3.6 }),
    collision: (p) => {
      const h = num(p, 'size') / 2 - 0.25;
      return { solids: [[-h, -h], [h, -h], [-h, h], [h, h]].map(([x, z]) => ({ minX: x! - 0.15, maxX: x! + 0.15, minZ: z! - 0.15, maxZ: z! + 0.15 })), walkable: [centered(num(p, 'size'), num(p, 'size'))] };
    },
    sockets: () => [], clearance: { front: 1.2, side: 1 }, capabilities: [], lod: { levels: 2, cullDistance: 110 }, cost: { triangles: 700, drawCalls: 4, instanced: false }, review: 'approved',
  },
  {
    id: 'ls.courtyard.tiles', version: 1, component: 'LandscapeCourtyard', category: 'landscape', description: 'Walkable paved courtyard / plaza patch in stone or brick patterns.', districts: ['historic', 'residential', 'office', 'shopping', 'park'],
    params: { width: { type: 'number', min: 4, max: 16, default: 8, step: 1, description: 'Width (x).' }, depth: { type: 'number', min: 4, max: 16, default: 8, step: 1, description: 'Depth (z).' }, pattern: { type: 'enum', values: ['stone', 'brick', 'checker'], default: 'stone', description: 'Paving pattern.' } },
    placement: 'ground', footprint: (p) => ({ w: num(p, 'width'), d: num(p, 'depth'), h: 0.05 }),
    collision: (p) => ({ solids: [], walkable: [centered(num(p, 'width'), num(p, 'depth'))] }),
    sockets: () => [], clearance: { front: 0, side: 0 }, capabilities: [], lod: { levels: 1, cullDistance: 120 }, cost: { triangles: 12, drawCalls: 1, instanced: false }, review: 'approved',
  },
  {
    id: 'ls.flowerbed', version: 1, component: 'LandscapeFlowerbed', category: 'landscape', description: 'Low kerbed flowerbed with seasonal blooms; roundabout and plaza centrepieces.', districts: ['park', 'shopping', 'office', 'waterfront', 'residential'],
    params: { width: { type: 'number', min: 1.5, max: 6, default: 3, step: 0.5, description: 'Width (x).' }, depth: { type: 'number', min: 1, max: 3, default: 1.5, step: 0.5, description: 'Depth (z).' }, palette: { type: 'enum', values: ['red', 'yellow', 'mixed'], default: 'mixed', description: 'Bloom colours.' } },
    placement: 'ground', footprint: (p) => ({ w: num(p, 'width'), d: num(p, 'depth'), h: 0.5 }),
    collision: (p) => ({ solids: [centered(num(p, 'width'), num(p, 'depth'))], walkable: [] }),
    sockets: () => [], clearance: { front: 0.5, side: 0.3 }, capabilities: [], lod: { levels: 1, cullDistance: 60 }, cost: { triangles: 400, drawCalls: 2, instanced: false }, review: 'approved',
  },
  {
    id: 'ls.rock.garden', version: 1, component: 'LandscapeRocks', category: 'landscape', description: 'Taihu scholar-rock group on gravel; garden and lane-courtyard feature.', districts: ['historic', 'park', 'residential'],
    params: { size: { type: 'number', min: 1.5, max: 4, default: 2.5, step: 0.5, description: 'Square bed side.' }, rocks: { type: 'int', min: 2, max: 6, default: 3, description: 'Number of rocks.' } },
    placement: 'ground', footprint: (p) => ({ w: num(p, 'size'), d: num(p, 'size'), h: 1.8 }),
    collision: (p) => ({ solids: [centered(num(p, 'size'), num(p, 'size'))], walkable: [] }),
    sockets: () => [], clearance: { front: 0.5, side: 0.3 }, capabilities: [], lod: { levels: 1, cullDistance: 70 }, cost: { triangles: 500, drawCalls: 2, instanced: false }, review: 'approved',
  },
];
