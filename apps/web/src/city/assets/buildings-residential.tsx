import { catalogEntry, type ParamValues, type Rect } from '@vibequest/shared';
import { candy, INK, Toon } from '../../world/toon';
import type { AssetComponent, AssetProps } from './types';

// Residential/historic kit. Walls extrude exactly the catalog collision solids, so the
// rendered silhouette and the server's collision always agree; trim stays inside them.

const FACADE: Record<string, string> = { 'grey-brick': '#a99fb8', 'red-brick': '#c9745f', stucco: candy.cream };
const TINT: Record<string, string> = { cream: candy.cream, peach: candy.peach, mint: candy.mint, lavender: candy.lavender };
const ROOF = '#5b4a6e';
const STONE = '#e8dcc4';
const GLASS = '#8fc3e6';

const geometry = (id: string, params: ParamValues) => {
  const entry = catalogEntry(id)!;
  return { size: entry.footprint(params), solids: entry.collision(params).solids };
};
const n = (p: ParamValues, key: string) => p[key] as number;
const s = (p: ParamValues, key: string) => p[key] as string;

function Box({ at, size, color, outline = false }: { at: [number, number, number]; size: [number, number, number]; color: string; outline?: boolean }) {
  return <mesh position={at}><boxGeometry args={size} /><Toon color={color} outline={outline} thickness={2} /></mesh>;
}
/** Extrude one collision rect from the ground to `height`. */
function Solid({ rect, height, color }: { rect: Rect; height: number; color: string }) {
  return <Box at={[(rect.minX + rect.maxX) / 2, height / 2, (rect.minZ + rect.maxZ) / 2]} size={[rect.maxX - rect.minX, height, rect.maxZ - rect.minZ]} color={color} outline />;
}
/** Gable roof over a rect, ridge along x; eaves overhang 0.3 m. */
function Gable({ rect, y, rise, color = ROOF }: { rect: Rect; y: number; rise: number; color?: string }) {
  const w = rect.maxX - rect.minX + 0.6, half = (rect.maxZ - rect.minZ) / 2 + 0.3;
  const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
  const slope = Math.hypot(half, rise), angle = Math.atan2(rise, half);
  return <group position={[cx, y, cz]}>
    <mesh position={[0, rise / 2, half / 2]} rotation={[angle, 0, 0]}><boxGeometry args={[w, 0.18, slope]} /><Toon color={color} thickness={2} /></mesh>
    <mesh position={[0, rise / 2, -half / 2]} rotation={[-angle, 0, 0]}><boxGeometry args={[w, 0.18, slope]} /><Toon color={color} thickness={2} /></mesh>
    <Box at={[0, 0.02, 0]} size={[rect.maxX - rect.minX, 0.04, rect.maxZ - rect.minZ]} color={color} />
  </group>;
}
/** Window or door panel flush on a +z facade at depth z. */
const Panel = ({ x, y, z, w, h, color }: { x: number; y: number; z: number; w: number; h: number; color: string }) => <Box at={[x, y, z + 0.03]} size={[w, h, 0.06]} color={color} />;

function LanehouseRow({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.lanehouse.row', params);
  const stories = n(params, 'stories'), wallH = stories * 3.2, front = size.d / 2, bays = n(params, 'bays'), shop = params.shopfront === true;
  return <group userData={{ clearView: 'solid' }}>
    {solids.map((rect, i) => <Solid key={i} rect={rect} height={wallH} color={FACADE[s(params, 'variant')]!} />)}
    <Gable rect={solids[0]!} y={wallH} rise={1.4} />
    {lod === 0 && Array.from({ length: bays }, (_, i) => {
      const x = -size.w / 2 + 4.5 * (i + 0.5);
      return <group key={i}>
        {/* Shikumen stone frame + black lacquer door (or an open shop bay) */}
        <Panel x={x} y={1.3} z={front} w={2.2} h={2.6} color={STONE} />
        <Panel x={x} y={1.1} z={front + 0.02} w={1.6} h={2.2} color={shop ? GLASS : INK} />
        <Box at={[x, 2.75, front + 0.15]} size={[2.6, 0.35, 0.3]} color={STONE} />
        {Array.from({ length: stories - 1 }, (_, f) => <Panel key={f} x={x} y={3.2 * (f + 1) + 1.5} z={front} w={1.6} h={1.3} color={GLASS} />)}
      </group>;
    })}
    {lod === 0 && <Box at={[0, 3.2, front + 0.05]} size={[size.w, 0.2, 0.12]} color={STONE} />}
  </group>;
}

function LanehouseCorner({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.lanehouse.corner', params);
  const wallH = n(params, 'stories') * 3.2, color = FACADE[s(params, 'variant')]!;
  return <group userData={{ clearView: 'solid' }}>
    {solids.map((rect, i) => <group key={i}><Solid rect={rect} height={wallH} color={color} /><Gable rect={rect} y={wallH} rise={1.4} /></group>)}
    {lod === 0 && <>
      <Panel x={-size.w / 4} y={1.2} z={size.d / 2} w={size.w / 2 - 1} h={2.4} color={GLASS} />
      <Box at={[-size.w / 4, 3.3, size.d / 2 + 0.4]} size={[size.w / 2 - 0.6, 0.15, 0.8]} color={STONE} />
      <Panel x={size.w / 4} y={1.1} z={0} w={1.4} h={2.2} color={INK} />
      {/* Low yard wall along the open front-right quadrant (decorative, below knee height) */}
      <Box at={[size.w / 4, 0.25, size.d / 2 - 0.1]} size={[size.w / 2, 0.5, 0.2]} color={STONE} />
    </>}
  </group>;
}

function LaneGate({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.lanehouse.gate', params);
  const archH = 3.6, opening = n(params, 'opening');
  return <group userData={{ clearView: 'solid' }}>
    {solids.map((rect, i) => <Solid key={i} rect={rect} height={archH} color={STONE} />)}
    <Box at={[0, (archH + size.h) / 2, 0]} size={[size.w, size.h - archH, size.d]} color={STONE} outline />
    <Box at={[0, size.h + 0.1, 0]} size={[size.w + 0.4, 0.2, size.d + 0.3]} color={ROOF} outline />
    {lod === 0 && <>
      <Panel x={0} y={archH + 0.6} z={size.d / 2} w={Math.min(opening, 2.6)} h={0.7} color={candy.raspberry} />
      <Panel x={0} y={archH + 1.25} z={size.d / 2} w={opening * 0.8} h={0.25} color={'#c9b48f'} />
    </>}
  </group>;
}

function CourtyardHouse({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.lanehouse.courtyard', params);
  const wallH = n(params, 'stories') * 3.2, color = FACADE[s(params, 'variant')]!;
  const buildings = solids.slice(0, 3), frontWalls = solids.slice(3);
  return <group userData={{ clearView: 'solid' }}>
    {buildings.map((rect, i) => <group key={i}><Solid rect={rect} height={wallH} color={color} /><Gable rect={rect} y={wallH} rise={1.2} /></group>)}
    {frontWalls.map((rect, i) => <Solid key={i} rect={rect} height={2.6} color={color} />)}
    {lod === 0 && <>
      <Box at={[0, 0.01, size.d * 0.2]} size={[size.w - 6, 0.02, size.d * 0.55]} color={STONE} />
      <Panel x={0} y={1.2} z={-size.d / 2 + size.d * 0.4} w={2} h={2.4} color={INK} />
      <Box at={[0, 2.8, size.d / 2 - 0.2]} size={[3.2, 0.25, 0.7]} color={ROOF} outline />
    </>}
  </group>;
}

function Balconies({ w, d, floors, color }: { w: number; d: number; floors: number; color: string }) {
  return <>{Array.from({ length: floors - 1 }, (_, f) => [-w / 4, w / 4].map((x, i) =>
    <Box key={`${f}.${i}`} at={[x, 3 * (f + 1) + 0.5, d / 2 + 0.2]} size={[w / 3, 1, 0.4]} color={color} />))}</>;
}
function WindowBands({ w, d, floors, from = 1 }: { w: number; d: number; floors: number; from?: number }) {
  return <>{Array.from({ length: floors - from }, (_, f) => <Panel key={f} x={0} y={3 * (f + from) + 1.6} z={d / 2} w={w - 1.6} h={1.1} color={GLASS} />)}</>;
}

function ApartmentLowrise({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.apartment.lowrise', params);
  const floors = n(params, 'floors'), color = TINT[s(params, 'tint')]!;
  return <group userData={{ clearView: 'solid' }}>
    <Solid rect={solids[0]!} height={floors * 3} color={color} />
    <Box at={[0, floors * 3 + 0.4, 0]} size={[size.w + 0.4, 0.8, size.d + 0.4]} color={ROOF} outline />
    {lod === 0 && <>
      <WindowBands w={size.w} d={size.d} floors={floors} />
      {params.balconies === true && <Balconies w={size.w} d={size.d} floors={floors} color={candy.silver} />}
      {params.groundShops === true && <Panel x={0} y={1.3} z={size.d / 2} w={size.w - 1} h={2.4} color={GLASS} />}
      {Array.from({ length: floors - 1 }, (_, f) => <Box key={f} at={[size.w / 2 - 1, 3 * (f + 1) + 2.3, size.d / 2 + 0.3]} size={[0.8, 0.5, 0.5]} color="#f4f1fa" />)}
    </>}
  </group>;
}

function ApartmentSlab({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.apartment.slab', params);
  const floors = n(params, 'floors'), color = TINT[s(params, 'tint')]!;
  return <group userData={{ clearView: 'solid' }}>
    <Solid rect={solids[0]!} height={floors * 3} color={color} />
    <Box at={[size.w / 4, floors * 3 + 0.5, 0]} size={[3, 1, 3]} color={candy.silver} outline />
    {lod === 0 && <>
      <WindowBands w={size.w} d={size.d} floors={floors} from={0} />
      <Box at={[0, 3, size.d / 2 + 0.6]} size={[4, 0.2, 1.2]} color={ROOF} outline />
    </>}
  </group>;
}

function ApartmentTower({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.apartment.tower', params);
  const floors = n(params, 'floors'), top = floors * 3, color = TINT[s(params, 'tint')]!, crown = s(params, 'crown');
  return <group userData={{ clearView: 'solid' }}>
    <Solid rect={solids[0]!} height={top} color={color} />
    {crown === 'pavilion' && <Gable rect={{ minX: -size.w / 3, maxX: size.w / 3, minZ: -size.d / 3, maxZ: size.d / 3 }} y={top} rise={1.5} color={candy.raspberry} />}
    {crown === 'spire' && <mesh position={[0, top + 0.75, 0]}><coneGeometry args={[size.w / 4, 1.5, 4]} /><Toon color={candy.teal} thickness={2} /></mesh>}
    {crown === 'flat' && <Box at={[0, top + 0.3, 0]} size={[size.w + 0.3, 0.6, size.d + 0.3]} color={ROOF} outline />}
    {lod === 0 && <>
      <WindowBands w={size.w} d={size.d} floors={floors} />
      {/* Corner balcony stacks on both front corners */}
      {[-1, 1].map((side) => <Box key={side} at={[side * (size.w / 2 - 1.2), top / 2 + 1.5, size.d / 2 + 0.25]} size={[2.4, top - 3, 0.5]} color={candy.silver} />)}
    </>}
  </group>;
}

function CompoundGate({ params, lod }: AssetProps) {
  const { size, solids } = geometry('bld.apartment.compound-gate', params);
  const [booth, post] = solids as [Rect, Rect];
  const left = s(params, 'booth') === 'left', armFrom = left ? booth.maxX : booth.minX, armTo = left ? post.minX : post.maxX;
  return <group userData={{ clearView: 'solid' }}>
    <Solid rect={booth} height={2.6} color={candy.cream} />
    <Box at={[(booth.minX + booth.maxX) / 2, 2.75, 0]} size={[booth.maxX - booth.minX + 0.6, 0.3, size.d + 0.4]} color={candy.raspberry} outline />
    <Solid rect={post} height={1.2} color={candy.silver} />
    {/* Lift barrier at 1 m: decorative; the driveway is walkable per catalog metadata. */}
    <Box at={[(armFrom + armTo) / 2, 1, 0]} size={[Math.abs(armTo - armFrom), 0.1, 0.1]} color={candy.lantern} />
    {lod === 0 && <Panel x={(booth.minX + booth.maxX) / 2} y={1.4} z={size.d / 2} w={1.4} h={1} color={GLASS} />}
  </group>;
}

function CompoundWall({ params, lod }: AssetProps) {
  const { solids } = geometry('bld.residential.wall', params);
  const rect = solids[0]!, height = n(params, 'height'), style = s(params, 'style'), length = rect.maxX - rect.minX;
  if (style === 'railing') return <group>
    <Solid rect={rect} height={0.6} color={STONE} />
    {lod === 0 ? Array.from({ length: Math.floor(length / 0.6) }, (_, i) => <Box key={i} at={[rect.minX + 0.3 + i * 0.6, 0.6 + (height - 0.6) / 2, 0]} size={[0.06, height - 0.6, 0.06]} color={INK} />)
      : <Box at={[0, height / 2 + 0.3, 0]} size={[length, height - 0.6, 0.04]} color={INK} />}
    <Box at={[0, height, 0]} size={[length, 0.06, 0.08]} color={INK} />
  </group>;
  return <group userData={{ clearView: 'solid' }}>
    <Solid rect={rect} height={height} color={style === 'brick' ? FACADE['grey-brick']! : candy.cream} />
    <Box at={[0, height + 0.08, 0]} size={[length + 0.2, 0.16, 0.7]} color={ROOF} />
    {lod === 0 && style === 'lattice' && Array.from({ length: Math.floor(length / 3) }, (_, i) => [-1, 1].map((face) =>
      <Box key={`${i}.${face}`} at={[rect.minX + 1.5 + i * 3, height * 0.6, face * 0.27]} size={[0.9, 0.9, 0.04]} color={candy.teal} />))}
  </group>;
}

export const buildingsResidentialAssets: Record<string, AssetComponent> = {
  'bld.lanehouse.row': LanehouseRow,
  'bld.lanehouse.corner': LanehouseCorner,
  'bld.lanehouse.gate': LaneGate,
  'bld.lanehouse.courtyard': CourtyardHouse,
  'bld.apartment.lowrise': ApartmentLowrise,
  'bld.apartment.slab': ApartmentSlab,
  'bld.apartment.tower': ApartmentTower,
  'bld.apartment.compound-gate': CompoundGate,
  'bld.residential.wall': CompoundWall,
};
