import { useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { text, type ParamValues } from '@vibequest/shared';
import { candy, INK, Toon } from '../../world/toon';
import { Lantern } from '../../world/decor';
import type { AssetComponent } from './types';

// Street kit. Entry-local space: origin at footprint centre on the ground, +z front, tile length along z.
// Dimensions mirror packages/shared/src/city/catalog/street.ts footprint()/collision().

const n = (p: ParamValues, key: string) => p[key] as number;
const ASPHALT = '#5d5868';
const KERB = '#c9c2d6';

function Box({ at, size, color, outline = true }: { at: [number, number, number]; size: [number, number, number]; color: string; outline?: boolean }) {
  return <mesh position={at}><boxGeometry args={size} /><Toon color={color} outline={outline} /></mesh>;
}
/** Flat ground slab sitting on y=0 with its top at `h`. */
function Slab({ w, d, h, color, x = 0, z = 0 }: { w: number; d: number; h: number; color: string; x?: number; z?: number }) {
  return <Box at={[x, h / 2, z]} size={[w, h, d]} color={color} outline={false} />;
}

/** Simplified Chinese label baked to a canvas (system CJK fonts; no font download). */
function useLabel(label: string, background: string, foreground: string) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = foreground; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(label, 128, 50, 240);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, [label, background, foreground]);
}
function Label({ zh, w, h, at, background, foreground = '#ffffff', back = false }: { zh: string; w: number; h: number; at: [number, number, number]; background: string; foreground?: string; back?: boolean }) {
  const map = useLabel(zh, background, foreground);
  return <group position={at}>
    <mesh position={[0, 0, .01]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={map} toneMapped={false} /></mesh>
    {back && <mesh position={[0, 0, -.01]} rotation={[0, Math.PI, 0]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={map} toneMapped={false} /></mesh>}
  </group>;
}

const RoadStraight: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'length');
  const dashes = Math.max(1, Math.floor(d / 3));
  return <>
    <Slab w={w} d={d} h={.02} color={ASPHALT} />
    {params.markings === 'center' && Array.from({ length: dashes }, (_, i) => <Slab key={i} w={.15} d={1.4} h={.025} color={candy.cream} z={-d / 2 + (i + .5) * d / dashes} />)}
    {params.markings === 'double-yellow' && [-.15, .15].map((x) => <Slab key={x} w={.1} d={d} h={.025} color={candy.lemon} x={x} />)}
  </>;
};

const RoadIntersection: AssetComponent = ({ params }) => {
  const s = n(params, 'size');
  const arms = params.arms === 'tee' ? [0, 1, 2] : [0, 1, 2, 3];
  return <>
    <Slab w={s} d={s} h={.02} color={ASPHALT} />
    {arms.map((arm) => <group key={arm} rotation={[0, arm * Math.PI / 2, 0]}><Slab w={s * .45} d={.3} h={.025} color={candy.cream} x={-s * .22} z={s / 2 - .3} /></group>)}
  </>;
};

const ZebraCrossing: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'depth');
  const stripes = Math.max(2, Math.floor(w / 1));
  return <>
    <Slab w={w} d={d} h={.02} color={ASPHALT} />
    {Array.from({ length: stripes }, (_, i) => <Slab key={i} w={.5} d={d * .9} h={.03} color={candy.cream} x={-w / 2 + (i + .5) * w / stripes} />)}
  </>;
};

const PAVING = { concrete: '#e4dccb', brick: '#d98c6a', granite: '#b9b3c4' } as Record<string, string>;
const Sidewalk: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'length');
  const joints = Math.max(1, Math.floor(d / 1.5));
  return <>
    <Slab w={w} d={d} h={.1} color={PAVING[params.paving as string] ?? PAVING.concrete} />
    <Slab w={.18} d={d} h={.12} color={KERB} x={w / 2 - .09} />
    {Array.from({ length: joints - 1 }, (_, i) => <Slab key={i} w={w - .2} d={.04} h={.105} color="#a39d90" z={-d / 2 + (i + 1) * d / joints} />)}
  </>;
};

const PavedLane: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'length');
  return <>
    <Slab w={w} d={d} h={.02} color={params.stone === 'red-brick' ? '#c27a62' : '#a7a2b0'} />
    <Slab w={.25} d={d} h={.025} color={candy.inkSoft} />
  </>;
};

const MetroEntrance: AssetComponent = ({ params }) => {
  const sign = text('landmark', String(params.sign))?.zh ?? '地铁';
  const glass = params.variant === 'glass-box';
  return <>
    {/* Side and back walls; the stair mouth opens to +z. */}
    {[-1.6, 1.6].map((x) => <Box key={x} at={[x, .6, 0]} size={[.2, 1.2, 6]} color="#8a8fa6" />)}
    <Box at={[0, .6, -2.9]} size={[3.4, 1.2, .2]} color="#8a8fa6" />
    <Slab w={3} d={5.6} h={.03} color="#4a4558" />
    {Array.from({ length: 6 }, (_, i) => <Slab key={i} w={3} d={.12} h={.04} color={candy.silver} z={2.4 - i * .7} />)}
    {glass
      ? <mesh position={[0, 2.2, -.3]}><boxGeometry args={[3.4, 2, 5.4]} /><meshToonMaterial color="#9fd8ff" transparent opacity={.35} /></mesh>
      : <Box at={[0, 2.7, -.4]} size={[3.6, .2, 5.2]} color={candy.navy} />}
    <Box at={[1.9, 1.3, 2.6]} size={[.25, 2.6, .25]} color={candy.navy} />
    <Label zh={sign} w={1.1} h={.42} at={[1.9, 2.2, 2.74]} background="#d6322d" back />
  </>;
};

const LampModern: AssetComponent = ({ params }) => {
  const h = n(params, 'height');
  const sides = params.arms === 'double' ? [-1, 1] : [1];
  return <>
    <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[.07, .11, h, 8]} /><Toon color="#5b6070" /></mesh>
    {sides.map((s) => <group key={s}>
      <Box at={[s * .55, h - .05, 0]} size={[1.1, .08, .08]} color="#5b6070" />
      <Box at={[s * 1.05, h - .15, 0]} size={[.4, .12, .2]} color={candy.cream} />
    </group>)}
  </>;
};

const LanternPost: AssetComponent = ({ params, still, seed }) => {
  const h = n(params, 'height');
  const count = n(params, 'lanterns');
  const xs = count === 1 ? [.55] : [-.55, .55];
  return <>
    <Box at={[0, h / 2, 0]} size={[.18, h, .18]} color={INK} />
    <Box at={[0, h - .1, 0]} size={[1.5, .1, .1]} color={INK} />
    {xs.map((x, i) => <Lantern key={x} at={[x, h - .15, 0]} drop={.4} phase={seed + i * 1.7} still={still} />)}
  </>;
};

const Bench: AssetComponent = ({ params }) => {
  const l = n(params, 'length');
  if (params.variant === 'stone') return <Box at={[0, .225, 0]} size={[l, .45, .5]} color="#b9b3c4" />;
  return <>
    {[-1, 1].map((s) => <Box key={s} at={[s * (l / 2 - .15), .22, 0]} size={[.08, .44, .5]} color={INK} />)}
    {[-.15, 0, .15].map((z) => <Box key={z} at={[0, .45, z]} size={[l, .05, .12]} color={candy.bark} outline={false} />)}
    <Box at={[0, .72, -.24]} size={[l, .3, .05]} color={candy.bark} />
  </>;
};

const BollardRow: AssetComponent = ({ params }) => {
  const count = n(params, 'count'), spacing = n(params, 'spacing');
  return <>{Array.from({ length: count }, (_, i) => <group key={i} position={[(i - (count - 1) / 2) * spacing, 0, 0]}>
    <mesh position={[0, .4, 0]}><cylinderGeometry args={[.12, .14, .8, 10]} /><Toon color="#6f7385" /></mesh>
    <mesh position={[0, .62, 0]}><cylinderGeometry args={[.125, .125, .08, 10]} /><Toon color={candy.lemon} outline={false} /></mesh>
  </group>)}</>;
};

const BikeRack: AssetComponent = ({ params }) => {
  const slots = n(params, 'slots');
  return <>{Array.from({ length: slots }, (_, i) => <mesh key={i} position={[(i - (slots - 1) / 2) * .8, .4, 0]} rotation={[0, Math.PI / 2, 0]}>
    <torusGeometry args={[.32, .03, 6, 12, Math.PI]} /><Toon color={candy.silver} />
  </mesh>)}</>;
};

const LIVERY = { yellow: candy.lemon, blue: candy.teal, green: candy.lime } as Record<string, string>;
function Bike({ color }: { color: string }) {
  return <>
    {[-.5, .5].map((z) => <mesh key={z} position={[0, .32, z]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.3, .04, 6, 14]} /><Toon color={INK} outline={false} /></mesh>)}
    <Box at={[0, .55, 0]} size={[.08, .08, 1]} color={color} />
    <Box at={[0, .8, -.3]} size={[.22, .06, .3]} color={INK} />
    <Box at={[0, .9, .45]} size={[.5, .05, .05]} color={INK} />
    <Box at={[0, .7, .6]} size={[.3, .2, .2]} color={color} />
  </>;
}
const SharedBikes: AssetComponent = ({ params }) => {
  const count = n(params, 'count');
  const color = LIVERY[params.fleet as string] ?? candy.lemon;
  return <>{Array.from({ length: count }, (_, i) => <group key={i} position={[(i - (count - 1) / 2) * .65, 0, 0]} rotation={[0, .35, 0]}><Bike color={color} /></group>)}</>;
};

// Shanghai sorting colours: recyclable blue, hazardous red, wet brown, dry black.
const SORT = ['#3b5bdb', '#d94f6b', '#8b5a3c', '#3a3346'];
const TrashBin: AssetComponent = ({ params }) => {
  const bins = params.variant === 'sorting' ? SORT : ['#4f8a6b'];
  return <>{bins.map((color, i) => <group key={color} position={[(i - (bins.length - 1) / 2) * .5, 0, 0]}>
    <Box at={[0, .45, 0]} size={[.44, .9, .44]} color={color} />
    <Box at={[0, .93, 0]} size={[.46, .06, .46]} color={candy.silver} outline={false} />
  </group>)}</>;
};

const BusStop: AssetComponent = ({ params }) => {
  const l = n(params, 'length');
  const road = text('road-name', String(params.road))?.zh ?? '';
  return <>
    <Box at={[0, 1.2, -.675]} size={[l, 2.2, .1]} color="#9fd8ff" />
    {[-1, 1].map((s) => <Box key={s} at={[s * (l / 2 - .1), 1.2, -.3]} size={[.12, 2.4, .12]} color="#5b6070" />)}
    <Box at={[0, 2.45, -.05]} size={[l + .2, .12, 1.6]} color={candy.teal} />
    <Box at={[0, .45, -.33]} size={[l * .6, .08, .45]} color={candy.bark} />
    <Label zh={road} w={1.2} h={.4} at={[l / 2 - .7, 2.15, .62]} background={candy.navy} />
  </>;
};

const StreetSign: AssetComponent = ({ params }) => {
  const road = text('road-name', String(params.road))?.zh ?? '';
  const arrow = params.arrow === 'left' ? '← ' : params.arrow === 'right' ? ' →' : '';
  const label = params.arrow === 'left' ? arrow + road : road + arrow;
  return <>
    <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[.05, .05, 2.8, 8]} /><Toon color="#5b6070" /></mesh>
    <Box at={[.3, 2.5, 0]} size={[1.3, .38, .05]} color={candy.navy} />
    <Label zh={label} w={1.2} h={.32} at={[.3, 2.5, .03]} background={candy.navy} back />
  </>;
};

const LoadingBay: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'depth'), pallets = n(params, 'pallets');
  const hatches = Math.max(2, Math.floor(w / .8));
  return <>
    <Slab w={w} d={d} h={.02} color="#6a6578" />
    {Array.from({ length: hatches }, (_, i) => <Slab key={i} w={.25} d={d * .8} h={.025} color={candy.lemon} x={-w / 2 + (i + .5) * w / hatches} />)}
    {Array.from({ length: pallets }, (_, i) => <group key={i} position={[(i - (pallets - 1) / 2) * 1.5, 0, -d / 2 + .7]}>
      <Box at={[0, .08, 0]} size={[1.1, .16, 1.1]} color={candy.bark} />
      <Box at={[0, .55, 0]} size={[1, .78, 1]} color="#c8a46e" />
    </group>)}
  </>;
};

export const streetAssets: Record<string, AssetComponent> = {
  'st.road.straight': RoadStraight, 'st.road.intersection': RoadIntersection, 'st.crossing.zebra': ZebraCrossing,
  'st.sidewalk': Sidewalk, 'st.lane.paved': PavedLane, 'st.metro.entrance': MetroEntrance,
  'st.lamp.modern': LampModern, 'st.lamp.lantern-post': LanternPost, 'st.bench': Bench, 'st.bollard': BollardRow,
  'st.bikerack': BikeRack, 'st.sharedbikes': SharedBikes, 'st.trashbin': TrashBin, 'st.busstop': BusStop,
  'st.streetsign': StreetSign, 'st.loading-bay': LoadingBay,
};
