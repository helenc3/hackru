import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshToonMaterial } from 'three';
import { catalogEntry, type ParamValues } from '@vibequest/shared';
import { candy, INK, Toon } from '../../world/toon';
import type { AssetComponent } from './types';

// Waterfront kit. Local frame matches packages/shared/src/city/catalog/waterfront.ts: origin at
// the footprint centre on the ground, +z toward the water. Sizes come from the catalog footprint.

const STONE = { granite: '#d8cfc4', brick: '#c9775b', stone: '#cfc6b8', timber: '#b9875a', steel: '#6d7f99', iron: INK } as Record<string, string>;
const num = (p: ParamValues, key: string) => p[key] as number;

function Box({ size, at = [0, size[1] / 2, 0], color, outline = true }: { size: [number, number, number]; at?: [number, number, number]; color: string; outline?: boolean }) {
  return <mesh position={at}><boxGeometry args={size} /><Toon color={color} outline={outline} thickness={1.6} /></mesh>;
}

function Railing({ length, style, z = 0 }: { length: number; style: string; z?: number }) {
  if (style === 'stone') return <group position={[0, 0, z]}>
    <Box size={[length, 0.7, 0.2]} color={STONE.stone} />
    <Box size={[length + 0.1, 0.12, 0.3]} at={[0, 0.76, 0]} color="#e8e0d4" />
  </group>;
  const posts = Math.max(2, Math.round(length / 1.2) + 1);
  return <group position={[0, 0, z]}>
    <Box size={[length, 0.06, 0.08]} at={[0, 1.05, 0]} color={INK} outline={false} />
    <Box size={[length, 0.04, 0.05]} at={[0, 0.55, 0]} color={INK} outline={false} />
    {Array.from({ length: posts }, (_, i) => <Box key={i} size={[0.06, 1.05, 0.06]} at={[-length / 2 + (length * i) / (posts - 1), 0.525, 0]} color={INK} outline={false} />)}
  </group>;
}

const RiverbankStraight: AssetComponent = ({ params }) => {
  const length = num(params, 'length');
  return <group>
    <Box size={[length, 0.12, 2]} color={STONE[params.style as string] ?? STONE.granite} outline={false} />
    <Box size={[length, 0.25, 0.35]} at={[0, 0.125, 0.82]} color="#bdb3a6" />
    {/* Quay face dropping to the water line. */}
    <Box size={[length, 0.9, 0.2]} at={[0, -0.45, 1.0]} color="#9d9387" outline={false} />
  </group>;
};

const RiverbankCorner: AssetComponent = ({ params }) => {
  const s = num(params, 'size');
  return <group>
    <Box size={[s, 0.12, s]} color={STONE.granite} outline={false} />
    <Box size={[s, 0.25, 0.35]} at={[0, 0.125, s / 2 - 0.18]} color="#bdb3a6" />
    <Box size={[0.35, 0.25, s]} at={[s / 2 - 0.18, 0.125, 0]} color="#bdb3a6" />
    {params.bollard && <mesh position={[s / 2 - 0.4, 0.35, s / 2 - 0.4]}><cylinderGeometry args={[0.16, 0.2, 0.5, 10]} /><Toon color={INK} thickness={1.6} /></mesh>}
  </group>;
};

const Promenade: AssetComponent = ({ params }) => {
  const length = num(params, 'length'), width = num(params, 'width');
  const paving = params.paving as string;
  const bands = Math.max(1, Math.floor(length / 4));
  return <group>
    <Box size={[length, 0.08, width]} color={STONE[paving] ?? STONE.granite} outline={false} />
    {Array.from({ length: bands }, (_, i) => <Box key={i} size={[0.25, 0.09, width]} at={[-length / 2 + (length / bands) * (i + 0.5), 0.045, 0]} color={paving === 'timber' ? '#94683f' : '#a99d90'} outline={false} />)}
    <Box size={[length, 0.1, 0.4]} at={[0, 0.05, -width / 2 + 0.2]} color={candy.grassDeep} outline={false} />
  </group>;
};

const WaterRailing: AssetComponent = ({ params }) => <Railing length={num(params, 'length')} style={params.style as string} />;

const LevelBridge: AssetComponent = ({ params }) => {
  const length = num(params, 'length'), width = num(params, 'width'), style = params.style as string;
  const deck = STONE[style] ?? STONE.steel;
  return <group>
    <Box size={[length, 0.3, width]} color={style === 'steel' ? '#8a96a8' : deck} />
    <Railing length={length} style={style === 'stone' ? 'stone' : 'iron'} z={-width / 2 + 0.15} />
    <Railing length={length} style={style === 'stone' ? 'stone' : 'iron'} z={width / 2 - 0.15} />
    {/* Steel truss arches echo the Waibaidu (Garden) Bridge. */}
    {style === 'steel' && [-width / 2 + 0.15, width / 2 - 0.15].map((z) => <mesh key={z} position={[0, 0.3, z]} rotation={[0, 0, 0]}>
      <torusGeometry args={[length / 2, 0.08, 6, 24, Math.PI]} /><Toon color={deck} thickness={1.6} />
    </mesh>)}
    {/* Abutment piers. */}
    {[-length / 2 + 0.4, length / 2 - 0.4].map((x) => <Box key={x} size={[0.8, 1.2, width * 0.8]} at={[x, -0.6, 0]} color="#9d9387" outline={false} />)}
  </group>;
};

const CanalEdge: AssetComponent = ({ params }) => {
  const length = num(params, 'length');
  const pots = params.planters ? Math.max(1, Math.floor(length / 3)) : 0;
  return <group>
    <Box size={[length, 0.06, 1.25]} at={[0, 0.03, -0.125]} color="#d4c6b0" outline={false} />
    <Box size={[length, 0.25, 0.25]} at={[0, 0.125, 0.625]} color="#a8a092" />
    {Array.from({ length: pots }, (_, i) => <group key={i} position={[-length / 2 + (length / pots) * (i + 0.5), 0.25, 0.625]}>
      <Box size={[0.3, 0.25, 0.22]} color={candy.coral} outline={false} />
      <mesh position={[0, 0.35, 0]}><sphereGeometry args={[0.2, 8, 6]} /><Toon color={candy.grassDeep} thickness={1.2} /></mesh>
    </group>)}
  </group>;
};

const CanalSteps: AssetComponent = ({ params }) => {
  const width = num(params, 'width'), steps = num(params, 'steps');
  const depth = steps * 0.4;
  return <group>
    {Array.from({ length: steps }, (_, i) => <Box key={i} size={[width, 0.12, 0.4]} at={[0, -0.12 * i - 0.06, -depth / 2 + 0.2 + i * 0.4]} color={i % 2 ? '#c4baa9' : '#d0c7b8'} outline={i === 0} />)}
  </group>;
};

const ViewingPier: AssetComponent = ({ params }) => {
  const length = num(params, 'length'), width = num(params, 'width');
  return <group>
    <Box size={[width, 0.2, length]} color={STONE.timber} />
    <group position={[-width / 2 + 0.1, 0, 0]} rotation={[0, Math.PI / 2, 0]}><Railing length={length} style="iron" /></group>
    <group position={[width / 2 - 0.1, 0, 0]} rotation={[0, Math.PI / 2, 0]}><Railing length={length} style="iron" /></group>
    <Railing length={width} style="iron" z={length / 2 - 0.1} />
    {[-width / 2 + 0.3, width / 2 - 0.3].flatMap((x) => [-length / 2 + 0.5, length / 2 - 0.5].map((z) => <Box key={`${x},${z}`} size={[0.25, 1.2, 0.25]} at={[x, -0.6, z]} color="#7a5a3c" outline={false} />))}
    {params.canopy && <group position={[0, 0, length / 2 - 1.5]}>
      {[-width / 2 + 0.3, width / 2 - 0.3].map((x) => <Box key={x} size={[0.12, 2.8, 0.12]} at={[x, 1.4, 0]} color={INK} outline={false} />)}
      <Box size={[width, 0.15, 2.4]} at={[0, 2.9, 0]} color={candy.raspberry} />
    </group>}
  </group>;
};

const MooredBoat: AssetComponent = ({ params, still, seed }) => {
  const kind = params.kind as string;
  const { w, d, h } = catalogEntry('wf.boat.moored')!.footprint(params);
  const hull = useRef<Mesh>(null);
  useFrame(({ clock }) => { if (!still && hull.current) hull.current.parent!.rotation.z = 0.025 * Math.sin(clock.elapsedTime * 0.9 + seed); });
  const cabin = kind === 'sampan' ? null : <Box size={[w * 0.55, h * 0.45, d * 0.75]} at={[-w * 0.05, 0.6 + h * 0.225, 0]} color={kind === 'tour' ? candy.cream : '#e9f1f7'} />;
  return <group userData={{ batch: 'self' }}>
    <mesh ref={hull} position={[0, 0.2, 0]} scale={[w, 0.8, d]}><boxGeometry /><Toon color={kind === 'sampan' ? candy.bark : kind === 'tour' ? candy.raspberry : '#3b6ea5'} thickness={1.6} /></mesh>
    {cabin}
    {kind === 'sampan' && <mesh position={[0, 0.75, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, d / 1.6]}><cylinderGeometry args={[0.6, 0.6, w * 0.4, 10, 1, true, 0, Math.PI]} /><meshToonMaterial color="#c9a46b" side={2} /></mesh>}
    {kind === 'tour' && <Box size={[w * 0.4, 0.2, d * 0.6]} at={[-w * 0.05, 0.6 + h * 0.45 + 0.1, 0]} color={candy.lantern} />}
  </group>;
};

/**
 * Manifest Water rect (river or creek), centred at the origin with `width` × `depth` metres.
 * The surface sits just below ground; a shimmer layer breathes unless reduced motion asks for still.
 */
export function WaterSurface({ width, depth, kind, still }: { width: number; depth: number; kind: 'river' | 'creek'; still: boolean }) {
  const shimmer = useRef<MeshToonMaterial>(null);
  useFrame(({ clock }) => { if (!still && shimmer.current) shimmer.current.opacity = 0.18 + 0.08 * Math.sin(clock.elapsedTime * 1.3); });
  const color = kind === 'river' ? '#5a9fc8' : '#6fb7a8';
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]}><planeGeometry args={[width, depth]} /><Toon color={color} outline={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.33, 0]}><planeGeometry args={[width * 0.9, depth * 0.9]} /><meshToonMaterial ref={shimmer} color="#ffffff" transparent opacity={0.2} depthWrite={false} /></mesh>
  </group>;
}

export const waterfrontAssets: Record<string, AssetComponent> = {
  'wf.riverbank.straight': RiverbankStraight,
  'wf.riverbank.corner': RiverbankCorner,
  'wf.promenade': Promenade,
  'wf.railing': WaterRailing,
  'wf.bridge.level': LevelBridge,
  'wf.canal.edge': CanalEdge,
  'wf.canal.steps': CanalSteps,
  'wf.pier.viewing': ViewingPier,
  'wf.boat.moored': MooredBoat,
};
