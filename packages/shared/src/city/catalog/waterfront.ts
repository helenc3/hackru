import type { CatalogEntry, CollisionShape, ParamValues, Rect, Socket } from '../contracts.js';

// Waterfront kit: Huangpu quays, Suzhou-Creek-style canal edges, level bridges, viewing piers.
// Local frame: origin at the footprint centre, +z faces the water. Water itself is blocked by the
// validator from manifest Water rects; these entries only add walkable decks and thin solids.

const n = (params: ParamValues, key: string) => params[key] as number;
const rect = (w: number, d: number, cx = 0, cz = 0): Rect => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
const walk = (w: number, d: number): CollisionShape => ({ solids: [], walkable: [rect(w, d)] });
const length = (min: number, max: number, def: number, description = 'Length along the bank (x), metres') => ({ type: 'number' as const, min, max, default: def, step: 1, description });
const lampsAlong = (len: number, z: number, spacing = 8): Socket[] => {
  const count = Math.max(1, Math.floor(len / spacing));
  return Array.from({ length: count }, (_, i) => ({ id: `lamp-${i}`, kind: 'lamp' as const, x: -len / 2 + (len / count) * (i + 0.5), y: 0, z, facing: 0 as const }));
};
const base = { version: 1, category: 'waterfront' as const, capabilities: [] as const, review: 'approved' as const, sockets: (): Socket[] => [] };

export const waterfrontEntries: readonly CatalogEntry[] = [
  {
    ...base, id: 'wf.riverbank.straight', component: 'RiverbankStraight',
    description: 'Granite quay edge along the river: walkable top with a stone kerb at the water side.',
    districts: ['waterfront', 'park'], placement: 'water-edge',
    params: { length: length(8, 40, 20), style: { type: 'enum', values: ['granite', 'brick'], default: 'granite', description: 'Facing stone' } },
    footprint: (p) => ({ w: n(p, 'length'), d: 2, h: 0.3 }),
    collision: (p) => walk(n(p, 'length'), 2),
    sockets: (p) => [{ id: 'railing', kind: 'railing', x: 0, y: 0.15, z: 0.9, facing: 0 }, ...lampsAlong(n(p, 'length'), -0.7)],
    clearance: { front: 0, side: 0 }, lod: { levels: 1, cullDistance: 120 }, cost: { triangles: 24, drawCalls: 2, instanced: false },
  },
  {
    ...base, id: 'wf.riverbank.corner', component: 'RiverbankCorner',
    description: 'Square quay corner where the river bank turns 90° or meets a creek mouth.',
    districts: ['waterfront', 'park'], placement: 'water-edge',
    params: { size: { type: 'number', min: 2, max: 8, default: 4, step: 1, description: 'Side length, metres' }, bollard: { type: 'boolean', default: true, description: 'Mooring bollard on the corner' } },
    footprint: (p) => ({ w: n(p, 'size'), d: n(p, 'size'), h: 0.3 }),
    // The bollard's 0.8 m corner cell is carved out of the walkable deck.
    collision: (p) => {
      const s = n(p, 'size');
      return p.bollard ? { solids: [rect(0.4, 0.4, s / 2 - 0.4, s / 2 - 0.4)], walkable: [rect(s, s - 0.8, 0, -0.4), rect(s - 0.8, 0.8, -0.4, s / 2 - 0.4)] } : walk(s, s);
    },
    clearance: { front: 0, side: 0 }, lod: { levels: 1, cullDistance: 120 }, cost: { triangles: 40, drawCalls: 3, instanced: false },
  },
  {
    ...base, id: 'wf.promenade', component: 'Promenade',
    description: 'Wide riverside walk (Bund-style) with paving bands and lamp sockets on the land side.',
    districts: ['waterfront'], placement: 'ground',
    params: {
      length: length(8, 40, 20), width: { type: 'number', min: 3, max: 12, default: 6, step: 0.5, description: 'Depth from land to water (z), metres' },
      paving: { type: 'enum', values: ['granite', 'timber', 'brick'], default: 'granite', description: 'Surface material' },
    },
    footprint: (p) => ({ w: n(p, 'length'), d: n(p, 'width'), h: 0.1 }),
    collision: (p) => walk(n(p, 'length'), n(p, 'width')),
    sockets: (p) => lampsAlong(n(p, 'length'), -n(p, 'width') / 2 + 0.6),
    clearance: { front: 0, side: 0 }, lod: { levels: 1, cullDistance: 140 }, cost: { triangles: 60, drawCalls: 2, instanced: false },
  },
  {
    ...base, id: 'wf.railing', component: 'WaterRailing',
    description: 'Waist-high railing along a quay or canal edge; thin solid that keeps the water edge readable.',
    districts: ['waterfront', 'park', 'historic'], placement: 'water-edge', attachesTo: ['railing'],
    params: { length: length(2, 40, 10), style: { type: 'enum', values: ['iron', 'stone'], default: 'iron', description: 'Black iron balusters or carved stone' } },
    footprint: (p) => ({ w: n(p, 'length'), d: 0.2, h: 1.1 }),
    collision: (p) => ({ solids: [rect(n(p, 'length'), 0.2)], walkable: [] }),
    clearance: { front: 0, side: 0 }, lod: { levels: 2, cullDistance: 80 }, cost: { triangles: 120, drawCalls: 2, instanced: true },
  },
  {
    ...base, id: 'wf.bridge.level', component: 'LevelBridge',
    description: 'Level walkable bridge deck over a creek or river; length runs along x. Used by manifest Bridges.',
    districts: ['waterfront', 'historic', 'park', 'shopping', 'residential'], placement: 'water',
    params: {
      length: length(6, 40, 14, 'Span along x, metres'), width: { type: 'number', min: 3, max: 12, default: 5, step: 0.5, description: 'Deck width including parapets (z), metres' },
      style: { type: 'enum', values: ['steel', 'stone', 'timber'], default: 'steel', description: 'Garden-bridge steel, stone, or timber' },
    },
    footprint: (p) => ({ w: n(p, 'length'), d: n(p, 'width'), h: 1.3 }),
    // Parapets are solid strips on both long sides; the deck between them is walkable.
    collision: (p) => {
      const l = n(p, 'length'), w = n(p, 'width');
      const edge = w / 2 - 0.3;
      return { solids: [{ minX: -l / 2, maxX: l / 2, minZ: -w / 2, maxZ: -edge }, { minX: -l / 2, maxX: l / 2, minZ: edge, maxZ: w / 2 }], walkable: [{ minX: -l / 2, maxX: l / 2, minZ: -edge, maxZ: edge }] };
    },
    sockets: (p) => [{ id: 'lamp-west', kind: 'lamp', x: -n(p, 'length') / 2 + 0.4, y: 0.3, z: -n(p, 'width') / 2 + 0.15, facing: 0 }, { id: 'lamp-east', kind: 'lamp', x: n(p, 'length') / 2 - 0.4, y: 0.3, z: n(p, 'width') / 2 - 0.15, facing: 180 }],
    clearance: { front: 0, side: 0 }, lod: { levels: 2, cullDistance: 160 }, cost: { triangles: 260, drawCalls: 4, instanced: false },
  },
  {
    ...base, id: 'wf.canal.edge', component: 'CanalEdge',
    description: 'Narrow creek-side footpath with a low stone kerb, for lane-house canals.',
    districts: ['historic', 'residential', 'park'], placement: 'water-edge',
    params: { length: length(4, 40, 12), planters: { type: 'boolean', default: false, description: 'Potted plants on the kerb' } },
    footprint: (p) => ({ w: n(p, 'length'), d: 1.5, h: 0.25 }),
    collision: (p) => ({ solids: [rect(n(p, 'length'), 0.25, 0, 0.625)], walkable: [rect(n(p, 'length'), 1.25, 0, -0.125)] }),
    clearance: { front: 0, side: 0 }, lod: { levels: 1, cullDistance: 90 }, cost: { triangles: 36, drawCalls: 2, instanced: false },
  },
  {
    ...base, id: 'wf.canal.steps', component: 'CanalSteps',
    description: 'Stone steps descending to the water (decorative; the flat movement model keeps them solid).',
    districts: ['historic', 'waterfront'], placement: 'water-edge',
    params: { width: { type: 'number', min: 2, max: 6, default: 3, step: 0.5, description: 'Stair width (x), metres' }, steps: { type: 'int', min: 3, max: 6, default: 4, description: 'Number of treads' } },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'steps') * 0.4, h: 0.1 }),
    collision: (p) => ({ solids: [rect(n(p, 'width'), n(p, 'steps') * 0.4)], walkable: [] }),
    clearance: { front: 0, side: 0.3 }, lod: { levels: 1, cullDistance: 70 }, cost: { triangles: 72, drawCalls: 1, instanced: false },
  },
  {
    ...base, id: 'wf.pier.viewing', component: 'ViewingPier',
    description: 'Timber viewing deck jutting over the river, railed on three sides: the classic photo platform.',
    districts: ['waterfront'], placement: 'water-edge',
    params: {
      length: length(4, 14, 8, 'Projection over the water (z), metres'), width: { type: 'number', min: 3, max: 10, default: 5, step: 0.5, description: 'Deck width (x), metres' },
      canopy: { type: 'boolean', default: false, description: 'Shade canopy at the end' },
    },
    footprint: (p) => ({ w: n(p, 'width'), d: n(p, 'length'), h: p.canopy ? 3 : 1.1 }),
    collision: (p) => {
      const w = n(p, 'width'), l = n(p, 'length');
      const x = w / 2 - 0.2, tip = l / 2 - 0.2;
      return { solids: [{ minX: -w / 2, maxX: -x, minZ: -l / 2, maxZ: l / 2 }, { minX: x, maxX: w / 2, minZ: -l / 2, maxZ: l / 2 }, { minX: -x, maxX: x, minZ: tip, maxZ: l / 2 }], walkable: [{ minX: -x, maxX: x, minZ: -l / 2, maxZ: tip }] };
    },
    sockets: (p) => [{ id: 'lamp-tip', kind: 'lamp', x: -n(p, 'width') / 2 + 0.1, y: 0.1, z: n(p, 'length') / 2 - 0.1, facing: 0 }],
    clearance: { front: 0, side: 0.5 }, lod: { levels: 2, cullDistance: 140 }, cost: { triangles: 220, drawCalls: 4, instanced: false },
  },
  {
    ...base, id: 'wf.boat.moored', component: 'MooredBoat',
    description: 'Boat moored in the water: small sampan for creeks, ferry or tour boat for the river.',
    districts: ['waterfront', 'historic'], placement: 'water',
    params: { kind: { type: 'enum', values: ['sampan', 'ferry', 'tour'], default: 'sampan', description: 'Boat type; sets size' } },
    footprint: (p) => boatSize(p.kind as string),
    collision: (p) => { const { w, d } = boatSize(p.kind as string); return { solids: [rect(w, d)], walkable: [] }; },
    clearance: { front: 0.5, side: 0.5 }, lod: { levels: 2, cullDistance: 160 }, cost: { triangles: 180, drawCalls: 4, instanced: false },
  },
];

function boatSize(kind: string): { w: number; d: number; h: number } {
  return kind === 'ferry' ? { w: 14, d: 5, h: 4 } : kind === 'tour' ? { w: 18, d: 5, h: 4.5 } : { w: 5, d: 1.6, h: 1.2 };
}
