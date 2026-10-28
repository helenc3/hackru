import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace, type Group } from 'three';
import { npcIdentity, type ParamValues, type Position, type TextCatalogName } from '@vibequest/shared';
import { useCityText } from '../language';
import { candy, INK, Toon } from '../../world/toon';
import { Npc } from '../../world/characters';
import type { AssetComponent } from './types';

// Interaction anchors. Geometry mirrors packages/shared/src/city/catalog/anchors.ts footprints.
const num = (p: ParamValues, key: string, fallback: number) => (typeof p[key] === 'number' ? p[key] : fallback);
const str = (p: ParamValues, key: string, fallback: string) => (typeof p[key] === 'string' ? p[key] : fallback);

// Reviewed catalog text drawn to a canvas: drei <Text> fonts lack CJK glyphs, so use the system font.
const textures = new Map<string, CanvasTexture>();
function labelTexture(zh: string, background: string, ink: string): CanvasTexture {
  const key = `${zh}|${background}|${ink}`;
  let texture = textures.get(key);
  if (!texture) {
    const lines = zh.split('\n');
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128 * Math.max(1, lines.length);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${lines.length > 1 ? 72 : 88}px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line, 256, 64 + i * 128, 490));
    texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    textures.set(key, texture);
  }
  return texture;
}
function Label({ catalog, textKey, width, height, position, background = candy.lemon, ink = INK }: {
  catalog: TextCatalogName; textKey: string; width: number; height: number; position: [number, number, number]; background?: string; ink?: string;
}) {
  const zh = useCityText(catalog, textKey);
  const map = useMemo(() => labelTexture(zh, background, ink), [zh, background, ink]);
  return <mesh position={position}><planeGeometry args={[width, height]} /><meshBasicMaterial map={map} toneMapped={false} /></mesh>;
}
function Box({ size, at, color, outline = true }: { size: [number, number, number]; at: [number, number, number]; color: string; outline?: boolean }) {
  return <mesh position={at}><boxGeometry args={size} /><Toon color={color} outline={outline} /></mesh>;
}

function CafeCounter({ params }: { params: ParamValues }) {
  const w = num(params, 'width', 4), teahouse = params.style !== 'modern';
  return <group userData={{ clearView: 'solid' }}>
    <Box size={[w, 1.05, 0.7]} at={[0, 0.525, 0.9]} color={teahouse ? candy.bark : candy.cream} />
    <Box size={[w + 0.1, 0.08, 0.85]} at={[0, 1.09, 0.9]} color={candy.cream} />
    <Box size={[w, 2.6, 0.2]} at={[0, 1.3, -1.15]} color={teahouse ? candy.raspberry : candy.mint} />
    {[-1, 1].map((side) => <Box key={side} size={[0.14, 2.6, 0.14]} at={[side * (w / 2 - 0.1), 1.3, 1.1]} color={INK} />)}
    <group userData={{ clearView: 'fade' }}>
      {teahouse
        ? <mesh position={[0, 2.85, 0]} rotation={[0, Math.PI / 4, 0]} scale={[w * 0.78, 1, 2.1]}><coneGeometry args={[1, 0.7, 4]} /><Toon color={candy.plum} /></mesh>
        : <Box size={[w + 0.4, 0.15, 2.9]} at={[0, 2.68, 0.15]} color={candy.teal} />}
    </group>
    {teahouse && [-1, 1].map((side) => <mesh key={side} position={[side * (w / 2 - 0.2), 2.3, 1.2]} scale={[1, 0.85, 1]}><sphereGeometry args={[0.18, 10, 8]} /><Toon color={candy.lantern} emissive={candy.lantern} emissiveIntensity={0.8} /></mesh>)}
    <Label catalog="shop-name" textKey={str(params, 'nameKey', 'cafe')} width={Math.min(2.4, w - 0.6)} height={0.6} position={[0, 2.2, 1.18]} />
    {[-0.5, 0.2, 0.9].map((x, i) => <mesh key={x} position={[x * (w / 4), 1.22, 0.85]}><cylinderGeometry args={[0.09, 0.07, 0.2, 10]} /><Toon color={[candy.cream, candy.mint, candy.coral][i]!} outline={false} /></mesh>)}
  </group>;
}

function DrinkStall({ params }: { params: ParamValues }) {
  return <group userData={{ clearView: 'solid' }}>
    <Box size={[2, 0.9, 1.1]} at={[0, 0.75, 0]} color={candy.teal} />
    <Box size={[1.4, 0.35, 0.7]} at={[-0.2, 1.38, 0]} color={candy.cream} />
    {[-0.8, 0.8].map((x) => <mesh key={x} position={[x, 0.25, 0.56]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.25, 0.25, 0.08, 14]} /><Toon color={INK} outline={false} /></mesh>)}
    <Label catalog="shop-name" textKey={str(params, 'nameKey', 'drinks')} width={1.4} height={0.38} position={[0, 0.85, 0.56]} />
    {params.umbrella !== false && <group userData={{ clearView: 'fade' }}>
      <mesh position={[0.6, 1.6, 0]}><cylinderGeometry args={[0.03, 0.03, 1.9, 6]} /><Toon color={INK} outline={false} /></mesh>
      <mesh position={[0.6, 2.5, 0]}><coneGeometry args={[1.15, 0.5, 8]} /><Toon color={candy.coral} /></mesh>
    </group>}
  </group>;
}

const fascia = { blue: candy.navy, green: candy.grassDeep, orange: candy.coral } as Record<string, string>;
function ConvenienceShop({ params }: { params: ParamValues }) {
  const band = fascia[str(params, 'fascia', 'blue')] ?? candy.navy;
  return <group userData={{ clearView: 'solid' }}>
    <Box size={[6, 3.2, 5]} at={[0, 1.6, 0]} color={candy.cream} />
    <Box size={[6.1, 0.4, 0.15]} at={[0, 3.4, 0]} color={band} />
    <Box size={[6.1, 0.55, 0.12]} at={[0, 2.85, 2.52]} color={band} />
    <Label catalog="shop-name" textKey={str(params, 'nameKey', 'convenience')} width={2.6} height={0.48} position={[-0.8, 2.85, 2.59]} background={band} ink={candy.cream} />
    <Box size={[2.6, 2, 0.06]} at={[-1.3, 1.2, 2.52]} color={candy.sky} outline={false} />
    <Box size={[1.2, 0.7, 0.5]} at={[1.6, 0.95, 2.2]} color={candy.silver} />
    <Box size={[1.4, 0.06, 0.6]} at={[1.6, 1.32, 2.3]} color={candy.cream} />
  </group>;
}

function InfoBoard({ params }: { params: ParamValues }) {
  if (params.style === 'kiosk') return <group userData={{ clearView: 'solid' }}>
    <Box size={[2, 1.1, 1.6]} at={[0, 0.55, 0]} color={candy.mint} />
    {[-0.9, 0.9].map((x) => <Box key={x} size={[0.12, 1.6, 0.12]} at={[x, 1.9, 0.7]} color={INK} />)}
    <group userData={{ clearView: 'fade' }}><Box size={[2.3, 0.15, 1.9]} at={[0, 2.75, 0]} color={candy.teal} /></group>
    <Label catalog="landmark" textKey="metro" width={1.6} height={0.4} position={[0, 0.7, 0.81]} background={candy.cream} />
  </group>;
  return <group userData={{ clearView: 'solid' }}>
    {[-0.7, 0.7].map((x) => <Box key={x} size={[0.1, 2.2, 0.1]} at={[x, 1.1, 0]} color={candy.inkSoft} />)}
    <Box size={[1.6, 1.1, 0.12]} at={[0, 1.5, 0]} color={candy.cream} />
    {/* Stylized street map: avenues, a river band and a star for "you are here". */}
    <Box size={[1.3, 0.06, 0.02]} at={[0, 1.55, 0.07]} color={candy.coral} outline={false} />
    <Box size={[0.06, 0.85, 0.02]} at={[-0.2, 1.5, 0.07]} color={candy.coral} outline={false} />
    <Box size={[0.18, 0.85, 0.02]} at={[0.55, 1.5, 0.07]} color={candy.sky} outline={false} />
    <mesh position={[-0.2, 1.55, 0.09]}><sphereGeometry args={[0.06, 8, 6]} /><Toon color={candy.raspberry} outline={false} /></mesh>
  </group>;
}

const HOTEL_W = 24, HOTEL_D = 16, PODIUM = 4.5, STOREY = 3.2;
function GrandHotel({ params, lod }: { params: ParamValues; lod: 0 | 1 | 2 }) {
  const floors = num(params, 'floors', 8), tower = floors * STOREY;
  return <group userData={{ clearView: 'solid' }}>
    <Box size={[HOTEL_W, PODIUM, HOTEL_D]} at={[0, PODIUM / 2, 0]} color={candy.sand} />
    {/* Stepped Art Deco massing: main tower, setback crown, spire. */}
    <Box size={[16, tower, 11]} at={[0, PODIUM + tower / 2, -1.5]} color={candy.cream} />
    <Box size={[10, 3, 7]} at={[0, PODIUM + tower + 1.5, -1.5]} color={candy.sand} />
    <mesh position={[0, PODIUM + tower + 4.2, -1.5]}><coneGeometry args={[1.2, 2.4, 4]} /><Toon color={candy.mustard} /></mesh>
    {lod === 0 && Array.from({ length: floors }, (_, i) => <Box key={i} size={[16.1, 0.12, 11.1]} at={[0, PODIUM + (i + 1) * STOREY, -1.5]} color={candy.mustard} outline={false} />)}
    {lod === 0 && [-6, -2, 2, 6].map((x) => <Box key={x} size={[1.4, tower - 1, 0.08]} at={[x, PODIUM + tower / 2, 4.05]} color={candy.sky} outline={false} />)}
    <Box size={[3, 3, 0.1]} at={[0, 1.5, HOTEL_D / 2 + 0.01]} color={candy.plum} outline={false} />
    <group userData={{ clearView: 'fade' }}>
      <Box size={[7, 0.3, 3]} at={[0, 3.4, HOTEL_D / 2 + 1.5]} color={candy.raspberry} />
    </group>
    <Label catalog="landmark" textKey="grand-hotel" width={6} height={1.5} position={[0, 4, HOTEL_D / 2 + 0.06]} background={candy.raspberry} ink={candy.lemon} />
    <Label catalog="landmark" textKey="grand-hotel" width={8} height={2} position={[0, PODIUM + tower + 1.5, 2.06]} background={candy.raspberry} ink={candy.lemon} />
  </group>;
}

function RiverViewpoint({ params, still }: { params: ParamValues; still: boolean }) {
  const w = num(params, 'width', 6);
  const ring = useRef<Group>(null);
  useFrame(({ clock }) => { if (!still && ring.current) ring.current.scale.setScalar(1 + 0.06 * Math.sin(clock.elapsedTime * 3)); });
  return <group>
    <Box size={[w, 0.2, 4]} at={[0, 0.1, 0]} color={candy.paving} outline={false} />
    <group userData={{ clearView: 'solid' }}>
      <Box size={[w, 0.08, 0.08]} at={[0, 1, 1.9]} color={candy.silver} />
      {Array.from({ length: Math.round(w) + 1 }, (_, i) => <Box key={i} size={[0.08, 1, 0.08]} at={[-w / 2 + i * (w / Math.round(w)), 0.5, 1.9]} color={candy.inkSoft} outline={false} />)}
      {params.benches !== false && [-1, 1].map((side) => <Box key={side} size={[1.2, 0.45, 0.45]} at={[side * (w / 2 - 0.8), 0.43, -1.4]} color={candy.bark} />)}
    </group>
    {/* Photo spot: a ring and footprints facing away from the river, so the shot has the water behind. */}
    <group ref={ring} position={[0, 0.22, 0.6]} userData={{ batch: 'self' }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.55, 0.7, 32]} /><meshBasicMaterial color={candy.lemon} toneMapped={false} /></mesh>
    </group>
    {[-0.15, 0.15].map((x) => <mesh key={x} position={[x, 0.215, 0.5]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.1, 10]} /><meshBasicMaterial color={candy.raspberry} /></mesh>)}
    <Label catalog="notice" textKey="photo-spot" width={1} height={0.25} position={[0, 0.8, 1.86]} background={candy.lemon} />
  </group>;
}

const nobody: RefObject<{ position: Position } | null> = { current: null };
const origin: Position = { x: 0, z: 0 };
function figure(defaultOutfit: string): AssetComponent {
  return function NpcFigure({ params, seed }) {
    return <group userData={{ clearView: 'solid' }}>
      <Npc id={npcIdentity(str(params, 'nameKey', 'xiaoli'))?.look ?? 'achen'} outfit={str(params, 'nameKey', '') === 'laowang' ? 'identity' : str(params, 'outfit', defaultOutfit)} index={seed % 7} look={nobody as RefObject<{ position: Position }>} offset={origin} />
    </group>;
  };
}

function MenuSign({ params }: { params: ParamValues }) {
  return <group userData={{ clearView: 'solid' }}>
    <mesh position={[0, 0.6, 0.12]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.75, 1.15, 0.05]} /><Toon color={INK} /></mesh>
    <mesh position={[0, 0.6, -0.12]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.75, 1.15, 0.05]} /><Toon color={INK} /></mesh>
    <group position={[0, 0.62, 0.16]} rotation={[-0.2, 0, 0]}>
      <Label catalog="menu" textKey={str(params, 'textKey', 'drinks')} width={0.62} height={0.8} position={[0, 0, 0]} background={candy.cream} />
    </group>
  </group>;
}

export const anchorsAssets: Record<string, AssetComponent> = {
  'an.vendor.cafe-counter': CafeCounter,
  'an.vendor.drink-stall': DrinkStall,
  'an.vendor.convenience': ConvenienceShop,
  'an.helper.info-board': InfoBoard,
  'an.hotel.grand': GrandHotel,
  'an.viewpoint.river': RiverViewpoint,
  'an.npc.vendor': figure('apron'),
  'an.npc.guide': figure('smart'),
  'an.npc.passerby': figure('casual'),
  'an.sign.menu': MenuSign,
};
