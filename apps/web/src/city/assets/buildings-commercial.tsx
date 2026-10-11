import { catalogEntry, type ParamValues } from '@vibequest/shared';
import { candy, INK, Toon } from '../../world/toon';
import type { AssetComponent, AssetProps } from './types';

// Commercial / office / industrial shells. Body sizes come from the shared entry's footprint(),
// so what renders is what collides. Front details sit 3 cm proud of the body face.

type V3 = [number, number, number];
const size = (id: string, params: ParamValues) => catalogEntry(id)!.footprint(params);
const solid = { clearView: 'solid' } as const;
// Mirrors storeyHeight in packages/shared/src/city/catalog/buildings-commercial.ts (detail placement only;
// body sizes always come from footprint()).
const storeyHeight = (floors: number) => 3.2 + (floors - 1) * 3;
const GROUND_H = storeyHeight(1);

function Box({ at, dims, color, outline = true, thickness }: { at: V3; dims: V3; color: string; outline?: boolean; thickness?: number }) {
  return <mesh position={at}><boxGeometry args={dims} /><Toon color={color} outline={outline} thickness={thickness} /></mesh>;
}
/** Thin panel on the front face (z = d/2). */
function Face({ x, y, w, h, d, color }: { x: number; y: number; w: number; h: number; d: number; color: string }) {
  return <Box at={[x, y, d / 2 + 0.03]} dims={[w, h, 0.06]} color={color} outline={false} />;
}
const facade: Record<string, string> = { stucco: candy.cream, brick: '#c86b4f', tile: '#e8d9c4', cream: candy.cream, mint: candy.mint, coral: candy.coral,
  concrete: '#d8d2c8', granite: '#bdb6c8', sandstone: '#e6c99a', red: '#b5523b', grey: '#9a96a6', blue: '#6f8fc7', green: '#7fae8c', jade: '#5aa58c' };
const glass: Record<string, string> = { teal: '#6cc4d8', silver: '#c8d4e6', bronze: '#c79a6b' };
const shopGlass = candy.teal;

/** Upper-floor window row. */
function Windows({ w, d, y, count, color = shopGlass, height = 1.2 }: { w: number; d: number; y: number; count: number; color?: string; height?: number }) {
  return <>{Array.from({ length: count }, (_, i) => <Face key={i} x={(i + 0.5) * w / count - w / 2} y={y} w={Math.min(1.4, w / count - 0.6)} h={height} d={d} color={color} />)}</>;
}

function Shell({ w, d, h, color, roof = INK, children }: { w: number; d: number; h: number; color: string; roof?: string; children?: React.ReactNode }) {
  return <group userData={solid}>
    <Box at={[0, h / 2, 0]} dims={[w, h, d]} color={color} thickness={3} />
    <Box at={[0, h + 0.1, 0]} dims={[w + 0.3, 0.2, d + 0.3]} color={roof} outline={false} />
    {children}
  </group>;
}

function ShopTwoStory({ params }: AssetProps) {
  const { w, d, h } = size('bld.shop.twostory', params);
  const floors = params.floors as number;
  return <Shell w={w} d={d} h={h} color={facade[params.variant as string]!} roof={candy.plum}>
    <Face x={0} y={1.4} w={w - 1} h={2.4} d={d} color={shopGlass} />
    {Array.from({ length: floors - 1 }, (_, i) => <Windows key={i} w={w} d={d} y={storeyHeight(i + 2) - 1.5} count={Math.max(1, Math.round(w / 2.5))} />)}
  </Shell>;
}

function ShopCorner({ params }: AssetProps) {
  const { w, d, h } = size('bld.shop.corner', params);
  const floors = params.floors as number;
  const body = facade[params.variant as string]!;
  return <Shell w={w} d={d} h={h} color={body} roof={candy.raspberry}>
    {/* Chamfered corner entrance: a dark diagonal panel across the front-right corner. */}
    <mesh position={[w / 2 - 0.6, 1.4, d / 2 - 0.6]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[1.8, 2.8, 0.08]} /><Toon color={INK} outline={false} /></mesh>
    <Face x={-w / 4} y={1.4} w={w / 2 - 0.6} h={2.4} d={d} color={shopGlass} />
    <mesh position={[w / 2 + 0.03, 1.4, -d / 4]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[d / 2 - 0.6, 2.4, 0.06]} /><Toon color={shopGlass} outline={false} /></mesh>
    {Array.from({ length: floors - 1 }, (_, i) => <Windows key={i} w={w} d={d} y={storeyHeight(i + 2) - 1.5} count={Math.round(w / 2.5)} />)}
    <Box at={[w / 2 - 0.6, h + 0.6, d / 2 - 0.6]} dims={[1, 1, 1]} color={candy.lemon} />
  </Shell>;
}

function ShopArcade({ params }: AssetProps) {
  const { w, d, h } = size('bld.shop.arcade', params);
  const floors = params.floors as number;
  const body = facade[params.variant as string]!;
  // Solid body z ∈ [-5, 2.5]; upper floors overhang the walkable arcade z ∈ [2.5, 5].
  const bodyDepth = 7.5;
  const columns = Math.max(2, Math.round(w / 3.5) + 1);
  return <group userData={solid}>
    <Box at={[0, GROUND_H / 2, -5 + bodyDepth / 2]} dims={[w, GROUND_H, bodyDepth]} color={body} thickness={3} />
    <Box at={[0, 1.4, 2.53]} dims={[w - 1, 2.3, 0.06]} color={shopGlass} outline={false} />
    <Box at={[0, (GROUND_H + h) / 2, 0]} dims={[w, h - GROUND_H, d]} color={body} thickness={3} />
    <Box at={[0, h + 0.1, 0]} dims={[w + 0.3, 0.2, d + 0.3]} color={candy.plum} outline={false} />
    {Array.from({ length: columns }, (_, i) => <Box key={i} at={[-w / 2 + 0.25 + i * (w - 0.5) / (columns - 1), GROUND_H / 2, 4.75]} dims={[0.5, GROUND_H, 0.5]} color={body} />)}
    {Array.from({ length: floors - 1 }, (_, i) => <Windows key={i} w={w} d={d} y={storeyHeight(i + 2) - 1.5} count={Math.round(w / 2.5)} />)}
  </group>;
}
function CafeSmall({ params }: AssetProps) {
  const { w, d } = size('bld.cafe.small', params);
  const body = facade[params.variant as string]!;
  return <Shell w={w} d={d} h={GROUND_H + 0.4} color={body} roof={candy.raspberry}>
    <Face x={0} y={1.5} w={w - 0.6} h={2.6} d={d} color={'#9fe3ef'} />
    {Array.from({ length: Math.round(w / 1.5) }, (_, i) => <Face key={i} x={-w / 2 + 0.3 + i * (w - 0.6) / Math.round(w / 1.5)} y={1.5} w={0.08} h={2.6} d={d + 0.02} color={INK} />)}
    {params.terrace && Array.from({ length: Math.round(w) }, (_, i) => <Box key={i} at={[-w / 2 + 0.2 + i * (w - 0.4) / Math.max(1, Math.round(w) - 1), GROUND_H + 0.85, d / 2 - 0.1]} dims={[0.06, 0.7, 0.06]} color={INK} outline={false} />)}
    {params.terrace && <Box at={[0, GROUND_H + 1.2, d / 2 - 0.1]} dims={[w, 0.08, 0.08]} color={INK} outline={false} />}
  </Shell>;
}

function RestaurantDimsum({ params }: AssetProps) {
  const { w, d } = size('bld.restaurant.dimsum', params);
  const wall = storeyHeight(2);
  const lacquer = params.variant === 'jade' ? '#2f8f6f' : '#c0392b';
  return <group userData={solid}>
    <Box at={[0, wall / 2, 0]} dims={[w, wall, d]} color={candy.cream} thickness={3} />
    {/* Upturned tiled roof: a wide eave slab, a smaller ridge, raised corner tips. */}
    <Box at={[0, wall + 0.2, 0]} dims={[w + 0.8, 0.3, d + 0.6]} color={'#3d3a4f'} thickness={3} />
    <Box at={[0, wall + 0.75, 0]} dims={[w - 1, 0.8, d - 2]} color={'#4a4660'} />
    {[-1, 1].map((sx) => <mesh key={sx} position={[sx * (w / 2 + 0.3), wall + 0.55, d / 2 + 0.2]} rotation={[0, 0, sx * -0.5]}><coneGeometry args={[0.18, 0.6, 6]} /><Toon color={candy.lemon} /></mesh>)}
    <Box at={[0, GROUND_H - 0.1, d / 2 + 0.05]} dims={[w, 0.25, 0.1]} color={lacquer} />
    <Face x={0} y={1.2} w={1.8} h={2.4} d={d} color={lacquer} />
    {[-1, 1].map((sx) => <Face key={sx} x={sx * w / 4} y={1.3} w={w / 4} h={1.6} d={d} color={'#ffd38a'} />)}
    <Windows w={w} d={d} y={GROUND_H + 1.5} count={3} color={lacquer} height={1.3} />
  </group>;
}

function RestaurantNoodle({ params }: AssetProps) {
  const { w, d, h } = size('bld.restaurant.noodle', params);
  return <Shell w={w} d={d} h={h} color={facade[params.variant as string]!} roof={candy.plum}>
    <Face x={-0.6} y={1.6} w={w - 2} h={1.4} d={d} color={'#ffe0a3'} />
    <Box at={[-0.6, 0.55, d / 2 + 0.2]} dims={[w - 2, 1.1, 0.4]} color={candy.bark} />
    <Box at={[-0.6, 2.55, d / 2 + 0.15]} dims={[w - 1.8, 0.3, 0.3]} color={candy.silver} />
    <Face x={w / 2 - 0.8} y={1.1} w={1} h={2.2} d={d} color={INK} />
    {Array.from({ length: (params.floors as number) - 1 }, (_, i) => <Windows key={i} w={w} d={d} y={storeyHeight(i + 2) - 1.5} count={2} />)}
  </Shell>;
}

function MarketHall({ params }: AssetProps) {
  const { w, d, h } = size('bld.market.hall', params);
  const wall = h - 2.5;
  const body = facade[params.variant as string]!;
  return <group userData={solid}>
    <Box at={[0, wall / 2, 0]} dims={[w, wall, d]} color={body} thickness={3} />
    {/* Barrel roof along x. */}
    <mesh position={[0, wall, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, d / 2 / 2.5]}><cylinderGeometry args={[2.5, 2.5, w, 16, 1, false, 0, Math.PI]} /><Toon color={'#7aa7c7'} thickness={3} /></mesh>
    <Face x={0} y={wall - 0.8} w={w - 1} h={0.8} d={d} color={'#bfe6ff'} />
    {[-1, 1].map((sx) => <Face key={sx} x={sx * w / 4} y={1.5} w={3} h={3} d={d} color={INK} />)}
  </group>;
}

function OfficeGlass({ params }: AssetProps) {
  const { w, d, h } = size('bld.office.glass', params);
  const floors = params.floors as number;
  const tint = glass[params.variant as string]!;
  return <Shell w={w} d={d} h={h - 0.6} color={tint} roof={'#5c5a70'}>
    {Array.from({ length: floors }, (_, i) => <Box key={i} at={[0, storeyHeight(i + 1), 0]} dims={[w + 0.08, 0.25, d + 0.08]} color={candy.silver} outline={false} />)}
    <Box at={[0, h - 0.3, -1]} dims={[w * 0.4, 0.6, d * 0.4]} color={'#8a879c'} />
    <Face x={0} y={1.4} w={3} h={2.6} d={d} color={INK} />
  </Shell>;
}

function OfficePodium({ params }: AssetProps) {
  const { w, d, h } = size('bld.office.podium', params);
  const stone = facade[params.variant as string]!;
  const columns = Math.round(w / 3) + 1;
  return <Shell w={w} d={d} h={h} color={stone} roof={'#6b6880'}>
    <Face x={0} y={1.5} w={w - 0.5} h={2.6} d={d} color={shopGlass} />
    {Array.from({ length: columns }, (_, i) => <Box key={i} at={[-w / 2 + 0.3 + i * (w - 0.6) / (columns - 1), GROUND_H / 2, d / 2 + 0.3]} dims={[0.45, GROUND_H, 0.45]} color={stone} />)}
    <Box at={[0, GROUND_H + 0.1, d / 2 + 0.3]} dims={[w, 0.3, 0.7]} color={stone} />
    <Windows w={w} d={d} y={storeyHeight(2) - 1.4} count={Math.round(w / 2.2)} />
  </Shell>;
}

function OfficeTower({ params }: AssetProps) {
  const { w } = size('bld.office.tower', params);
  const floors = params.floors as number;
  const body = storeyHeight(floors);
  const tint = glass[params.variant as string]!;
  return <group userData={solid}>
    <Box at={[0, GROUND_H / 2, 0]} dims={[w, GROUND_H, w]} color={'#bdb6c8'} thickness={3} />
    <Box at={[0, (GROUND_H + body) / 2, 0]} dims={[w - 0.6, body - GROUND_H, w - 0.6]} color={tint} thickness={3} />
    {Array.from({ length: floors - 1 }, (_, i) => <Box key={i} at={[0, storeyHeight(i + 2), 0]} dims={[w - 0.5, 0.18, w - 0.5]} color={candy.silver} outline={false} />)}
    <Face x={0} y={1.4} w={3} h={2.6} d={w} color={INK} />
    {params.crown === 'flat' && <Box at={[0, body + 0.3, 0]} dims={[w - 0.4, 0.6, w - 0.4]} color={'#6b6880'} />}
    {params.crown === 'stepped' && <><Box at={[0, body + 0.6, 0]} dims={[w * 0.7, 1.2, w * 0.7]} color={tint} /><Box at={[0, body + 1.85, 0]} dims={[w * 0.4, 1.3, w * 0.4]} color={tint} /></>}
    {params.crown === 'spire' && <><Box at={[0, body + 0.4, 0]} dims={[w * 0.5, 0.8, w * 0.5]} color={'#6b6880'} /><mesh position={[0, body + 2.9, 0]}><coneGeometry args={[0.35, 4.2, 6]} /><Toon color={candy.silver} /></mesh></>}
  </group>;
}

function WarehouseBrick({ params }: AssetProps) {
  const { w, d } = size('bld.warehouse.brick', params);
  const wall = 7;
  const brick = facade[params.variant as string]!;
  const teeth = Math.max(2, Math.round(w / 3));
  return <group userData={solid}>
    <Box at={[0, wall / 2, 0]} dims={[w, wall, d]} color={brick} thickness={3} />
    {params.sawtooth
      // Tilted roof planes, one per tooth; rise stays under the 8.5 m footprint height.
      ? Array.from({ length: teeth }, (_, i) => <mesh key={i} position={[-w / 2 + (i + 0.5) * w / teeth, wall + 0.75, 0]} rotation={[0, 0, 0.5]}><boxGeometry args={[w / teeth, 0.15, d]} /><Toon color={'#7d6a66'} /></mesh>)
      : <Box at={[0, wall + 0.1, 0]} dims={[w + 0.3, 0.2, d + 0.3]} color={'#5c4a46'} outline={false} />}
    <Face x={-w / 4} y={1.75} w={3.5} h={3.5} d={d} color={'#4d5a63'} />
    {Array.from({ length: Math.round(w / 3) }, (_, i) => <Face key={i} x={-w / 2 + (i + 0.5) * w / Math.round(w / 3)} y={5.2} w={1.1} h={1.6} d={d} color={'#bfe6ff'} />)}
  </group>;
}

function WarehouseShed({ params }: AssetProps) {
  const { w, d, h } = size('bld.warehouse.shed', params);
  const wall = h - 1.2;
  const cladding = facade[params.variant as string]!;
  return <group userData={solid}>
    <Box at={[0, wall / 2, 0]} dims={[w, wall, d]} color={cladding} thickness={3} />
    {/* Gable: a triangular prism spanning the depth. */}
    <mesh position={[0, wall + 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[w / (1.732 * 1.5), 1, 1.2 / 2.25]}><cylinderGeometry args={[1.5, 1.5, d, 3]} /><Toon color={candy.silver} /></mesh>
    <Face x={0} y={1.5} w={Math.min(4, w - 2)} h={3} d={d} color={'#c9c4d4'} />
  </group>;
}

export const buildingsCommercialAssets: Record<string, AssetComponent> = {
  'bld.shop.twostory': ShopTwoStory, 'bld.shop.corner': ShopCorner, 'bld.shop.arcade': ShopArcade, 'bld.cafe.small': CafeSmall,
  'bld.restaurant.dimsum': RestaurantDimsum, 'bld.restaurant.noodle': RestaurantNoodle, 'bld.market.hall': MarketHall,
  'bld.office.glass': OfficeGlass, 'bld.office.podium': OfficePodium, 'bld.office.tower': OfficeTower,
  'bld.warehouse.brick': WarehouseBrick, 'bld.warehouse.shed': WarehouseShed,
};
