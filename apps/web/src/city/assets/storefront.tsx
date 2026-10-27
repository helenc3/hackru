import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace, type Group, type MeshBasicMaterial } from 'three';
import { type ParamValues, type TextCatalogName } from '@vibequest/shared';
import { useCityText } from '../language';
import { candy, INK, Toon } from '../../world/toon';
import type { AssetComponent } from './types';

// Storefront modules: entry-local origin at the socket point, +z out of the façade.
// Sizes mirror packages/shared/src/city/catalog/storefront.ts footprint()/collision().
const n = (p: ParamValues, key: string) => p[key] as number;
const s = (p: ParamValues, key: string) => p[key] as string;
const CJK_FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const boards: Record<string, string> = { red: '#c8323c', gold: '#d9a52b', black: '#2a1838', green: '#2f7d5a', cream: candy.cream };
const neon: Record<string, string> = { pink: '#ff5fd2', cyan: '#5ff4ff', amber: '#ffb347', lime: '#b6ff5f' };
const frames: Record<string, string> = { black: INK, brass: '#c9a24a', white: '#f4f1ea' };
// Keep doors proud of the wall and its built-in facade panels (up to 6 cm deep).
const DOOR_FACADE_OFFSET = 0.1;

/**
 * Reviewed Chinese text drawn with the system CJK font into a CanvasTexture. drei's Text would
 * fetch a font at runtime, which is not guaranteed offline and rarely covers Hanzi.
 */
function useLabel(catalog: TextCatalogName, key: string, { vertical = false, ink = '#fff6e8', background = 'transparent', glow }: { vertical?: boolean; ink?: string; background?: string; glow?: string }) {
  const zh = useCityText(catalog, key).split('\n')[0] ?? '';
  const texture = useMemo(() => {
    const chars = [...zh];
    const cell = 128;
    const canvas = document.createElement('canvas');
    canvas.width = vertical ? cell : Math.max(1, chars.length) * cell;
    canvas.height = vertical ? Math.max(1, chars.length) * cell : cell;
    const g = canvas.getContext('2d');
    if (g) {
      g.fillStyle = background; g.fillRect(0, 0, canvas.width, canvas.height);
      g.font = `bold ${cell * 0.78}px ${CJK_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
      if (glow) { g.shadowColor = glow; g.shadowBlur = 18; }
      chars.forEach((c, i) => g.fillText(c, vertical ? cell / 2 : cell * (i + 0.5), vertical ? cell * (i + 0.5) : cell / 2));
    }
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return { map: result, aspect: canvas.width / canvas.height };
  }, [zh, vertical, ink, background, glow]);
  useEffect(() => () => texture.map.dispose(), [texture]);
  return texture;
}

function Box({ at, size, color, outline = true }: { at: [number, number, number]; size: [number, number, number]; color: string; outline?: boolean }) {
  return <mesh position={at}><boxGeometry args={size} /><Toon color={color} outline={outline} /></mesh>;
}
function Glass({ at, size }: { at: [number, number, number]; size: [number, number, number] }) {
  return <mesh position={at}><boxGeometry args={size} /><meshToonMaterial color="#bfe6ff" transparent opacity={0.55} /></mesh>;
}

const WoodDoor: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), variant = s(params, 'variant');
  const shikumen = variant === 'shikumen', h = shikumen ? 2.4 : 2.2;
  const leaf = shikumen ? INK : candy.bark;
  const leaves = variant === 'single' ? [0] : [-w / 4, w / 4];
  return <group position={[0, 0, DOOR_FACADE_OFFSET]}>
    {leaves.map((x) => <Box key={x} at={[x, h / 2, 0.02]} size={[w / leaves.length - 0.04, h, 0.08]} color={leaf} />)}
    {leaves.map((x) => <mesh key={`k${x}`} position={[x + (leaves.length === 1 ? w / 3 : -Math.sign(x) * w / 8), h * 0.48, 0.09]}><sphereGeometry args={[0.05, 8, 6]} /><Toon color={candy.mustard} outline={false} /></mesh>)}
    {shikumen
      ? <><Box at={[-w / 2 - 0.15, 1.5, 0.05]} size={[0.3, 3, 0.15]} color="#d8cbb4" /><Box at={[w / 2 + 0.15, 1.5, 0.05]} size={[0.3, 3, 0.15]} color="#d8cbb4" />
        <Box at={[0, 2.7, 0.05]} size={[w + 0.6, 0.6, 0.18]} color="#d8cbb4" /><mesh position={[0, 3.05, 0.05]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.4, 0.4, 0.14]} /><Toon color="#d8cbb4" /></mesh></>
      : <Box at={[0, h + 0.08, 0.04]} size={[w + 0.2, 0.16, 0.12]} color={candy.plum} />}
  </group>;
};

const GlassDoor: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), frame = frames[s(params, 'frame')] ?? INK;
  return <group position={[0, 0, DOOR_FACADE_OFFSET]}>
    <Glass at={[0, 1.15, 0]} size={[w, 2.3, 0.04]} />
    <Box at={[-w / 2, 1.2, 0]} size={[0.06, 2.4, 0.08]} color={frame} /><Box at={[w / 2, 1.2, 0]} size={[0.06, 2.4, 0.08]} color={frame} />
    <Box at={[0, 2.37, 0]} size={[w + 0.06, 0.06, 0.08]} color={frame} /><Box at={[0, 0.03, 0]} size={[w + 0.06, 0.06, 0.08]} color={frame} />
    <Box at={[0, 1.05, 0.06]} size={[w * 0.6, 0.05, 0.05]} color={frame} outline={false} />
  </group>;
};

const ShopWindow: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), h = n(params, 'height'), bars = n(params, 'mullions');
  return <group>
    <Box at={[0, 0.25, 0.02]} size={[w, 0.5, 0.12]} color={candy.plum} />
    <Glass at={[0, 0.5 + h / 2, 0]} size={[w, h, 0.04]} />
    <Box at={[0, 0.5 + h, 0.02]} size={[w, 0.06, 0.1]} color={INK} />
    {Array.from({ length: bars }, (_, i) => <Box key={i} at={[-w / 2 + w * (i + 1) / (bars + 1), 0.5 + h / 2, 0.03]} size={[0.05, h, 0.06]} color={INK} outline={false} />)}
  </group>;
};

const LatticeWindow: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), pattern = s(params, 'pattern');
  const bars = useMemo(() => {
    const out: { x: number; y: number; len: number; rot: number }[] = [];
    if (pattern === 'grid') {
      for (let i = 1; i < 4; i++) out.push({ x: -w / 2 + w * i / 4, y: 0.65, len: 1.2, rot: 0 });
      for (let i = 1; i < 4; i++) out.push({ x: 0, y: 0.05 + 1.2 * i / 4, len: w, rot: Math.PI / 2 });
    } else if (pattern === 'diamond') {
      for (let i = -2; i <= 2; i++) { out.push({ x: i * w / 5, y: 0.65, len: 1.3, rot: Math.PI / 5 }); out.push({ x: i * w / 5, y: 0.65, len: 1.3, rot: -Math.PI / 5 }); }
    } else {
      // Ice-crack: fixed irregular strokes, the same every render.
      [[-0.3, 0.4, 0.5, 0.3], [0.2, 0.8, 0.6, -0.6], [-0.1, 1, 0.4, 1.2], [0.35, 0.3, 0.45, 0.9], [-0.35, 0.95, 0.4, -0.2], [0, 0.55, 0.5, 2]]
        .forEach(([x, y, len, rot]) => out.push({ x: x * w, y, len, rot }));
    }
    return out;
  }, [w, pattern]);
  return <group>
    <mesh position={[0, 0.65, -0.02]}><planeGeometry args={[w, 1.2]} /><meshToonMaterial color="#fbe9c6" /></mesh>
    {bars.map((b, i) => <mesh key={i} position={[b.x, b.y, 0.01]} rotation={[0, 0, b.rot]}><boxGeometry args={[0.04, b.len, 0.04]} /><Toon color={candy.bark} outline={false} /></mesh>)}
    <Box at={[0, 0.02, 0.02]} size={[w + 0.1, 0.08, 0.1]} color={candy.bark} /><Box at={[0, 1.28, 0.02]} size={[w + 0.1, 0.08, 0.1]} color={candy.bark} />
    <Box at={[-w / 2, 0.65, 0.02]} size={[0.08, 1.3, 0.1]} color={candy.bark} /><Box at={[w / 2, 0.65, 0.02]} size={[0.08, 1.3, 0.1]} color={candy.bark} />
  </group>;
};

const stripePairs: Record<string, [string, string]> = { red: ['#e5484d', candy.cream], green: ['#3a9d6a', candy.cream], blue: ['#3b6fd8', candy.cream], yellow: [candy.lemon, '#ffffff'] };
const StripedAwning: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'depth'), [a, b] = stripePairs[s(params, 'stripes')] ?? stripePairs.red!;
  const count = Math.max(3, Math.round(w / 0.4));
  const slope = Math.atan2(0.5, d);
  return <group position={[0, 0, d / 2]} rotation={[slope, 0, 0]}>
    {Array.from({ length: count }, (_, i) => <mesh key={i} position={[-w / 2 + w * (i + 0.5) / count, 0, 0]}><boxGeometry args={[w / count, 0.04, Math.hypot(d, 0.5)]} /><Toon color={i % 2 ? b : a} outline={false} /></mesh>)}
    {Array.from({ length: count }, (_, i) => <mesh key={`v${i}`} position={[-w / 2 + w * (i + 0.5) / count, -0.1, Math.hypot(d, 0.5) / 2]}><boxGeometry args={[w / count, 0.2, 0.02]} /><Toon color={i % 2 ? b : a} outline={false} /></mesh>)}
  </group>;
};

const finishes: Record<string, string> = { steel: candy.silver, teal: candy.teal, wood: candy.bark };
const FlatCanopy: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'depth'), color = finishes[s(params, 'finish')] ?? candy.silver;
  const rod = Math.hypot(d, 0.9), tilt = Math.atan2(d, 0.9);
  return <group>
    <Box at={[0, 0, d / 2]} size={[w, 0.12, d]} color={color} />
    {/* Tie rods run from the wall at y=.9, z=0 to the canopy edge at y=0, z=d. */}
    {[-w / 2 + 0.2, w / 2 - 0.2].map((x) => <mesh key={x} position={[x, 0.45, d / 2]} rotation={[-tilt, 0, 0]}><cylinderGeometry args={[0.02, 0.02, rod, 6]} /><Toon color={INK} outline={false} /></mesh>)}
  </group>;
};

const tops: Record<string, string> = { steel: candy.silver, wood: '#c08552', tile: candy.cream };
const TakeawayCounter: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), d = n(params, 'depth');
  return <group>
    <Box at={[0, 0.48, 0]} size={[w, 0.96, d]} color={candy.coral} />
    <Box at={[0, 1, 0]} size={[w + 0.1, 0.08, d + 0.1]} color={tops[s(params, 'top')] ?? '#c08552'} />
    {[-w / 3, 0, w / 3].map((x, i) => <mesh key={x} position={[x, 1.1, 0.05]}><cylinderGeometry args={[0.05, 0.04, 0.12, 10]} /><Toon color={[candy.cream, candy.mint, candy.lemon][i]!} outline={false} /></mesh>)}
  </group>;
};

const VerticalSign: AssetComponent = ({ params }) => {
  const h = n(params, 'height'), board = boards[s(params, 'color')] ?? boards.red!;
  const { map } = useLabel('shop-name', s(params, 'label'), { vertical: true, ink: s(params, 'color') === 'gold' ? INK : candy.cream });
  return <group position={[0, 0, 0.35]}>
    <Box at={[0, 0, 0]} size={[0.1, h, 0.55]} color={board} />
    {[1, -1].map((side) => <mesh key={side} position={[side * 0.052, 0, 0]} rotation={[0, side * Math.PI / 2, 0]}><planeGeometry args={[0.5, h * 0.92]} /><meshBasicMaterial map={map} transparent toneMapped={false} /></mesh>)}
    <Box at={[0, h / 2 + 0.05, -0.3]} size={[0.06, 0.06, 0.4]} color={INK} outline={false} />
  </group>;
};

const HorizontalSign: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), color = s(params, 'color');
  const { map, aspect } = useLabel('shop-name', s(params, 'label'), { ink: color === 'gold' || color === 'cream' ? INK : candy.cream });
  const textW = Math.min(w * 0.9, 0.55 * aspect);
  return <group>
    <Box at={[0, 0, 0.06]} size={[w, 0.7, 0.12]} color={boards[color] ?? INK} />
    <mesh position={[0, 0, 0.125]}><planeGeometry args={[textW, textW / aspect]} /><meshBasicMaterial map={map} transparent toneMapped={false} /></mesh>
  </group>;
};

const NeonSign: AssetComponent = ({ params, still }) => {
  const tube = neon[s(params, 'color')] ?? neon.pink!;
  const { map, aspect } = useLabel('notice', s(params, 'label'), { ink: '#ffffff', glow: tube });
  const material = useRef<MeshBasicMaterial>(null);
  const flicker = Boolean(params.flicker) && !still;
  useFrame(({ clock }) => {
    if (!material.current) return;
    const t = clock.elapsedTime;
    material.current.opacity = flicker && Math.sin(t * 13) * Math.sin(t * 3.1) > 0.92 ? 0.35 : 1;
  });
  const textW = Math.min(1.3, 0.42 * aspect);
  return <group>
    <Box at={[0, 0, 0.02]} size={[1.4, 0.5, 0.04]} color="#1b1426" outline={false} />
    <mesh position={[0, 0, 0.05]}><planeGeometry args={[textW, textW / aspect]} /><meshBasicMaterial ref={material} map={map} color={tube} transparent toneMapped={false} /></mesh>
    <pointLight position={[0, 0, 0.4]} color={tube} intensity={0.6} distance={3} />
  </group>;
};

const slats: Record<string, string> = { silver: candy.silver, green: '#5f9e7a', blue: '#5b7fc4' };
const RollingShutter: AssetComponent = ({ params }) => {
  const w = n(params, 'width'), open = n(params, 'open'), color = slats[s(params, 'color')] ?? candy.silver;
  const drawn = 2.3 * (1 - open);
  const count = Math.max(1, Math.round(drawn / 0.12));
  return <group>
    <Box at={[0, 2.45, 0.08]} size={[w + 0.1, 0.3, 0.3]} color={color} />
    <Box at={[-w / 2 - 0.04, 1.2, 0.02]} size={[0.08, 2.4, 0.12]} color={INK} outline={false} />
    <Box at={[w / 2 + 0.04, 1.2, 0.02]} size={[0.08, 2.4, 0.12]} color={INK} outline={false} />
    {drawn > 0.05 && Array.from({ length: count }, (_, i) => <mesh key={i} position={[0, 2.3 - drawn * (i + 0.5) / count, 0.02]}><boxGeometry args={[w, drawn / count * 0.86, 0.04]} /><Toon color={color} outline={false} /></mesh>)}
  </group>;
};

const LanternPair: AssetComponent = ({ params, still }) => {
  const spacing = n(params, 'spacing'), color = s(params, 'color') === 'gold' ? candy.osmanthus : candy.lantern;
  const rig = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => { if (!still) rig.current.forEach((g, i) => { if (g) g.rotation.z = 0.05 * Math.sin(clock.elapsedTime * 1.4 + i * 1.7); }); });
  return <group>
    {[-spacing / 2, spacing / 2].map((x, i) => <group key={x} position={[x, 0, 0.3]}>
      <Box at={[0, 0, -0.15]} size={[0.05, 0.05, 0.3]} color={INK} outline={false} />
      <group ref={(node) => { rig.current[i] = node; }} userData={{ batch: 'self' }}>
        <mesh position={[0, -0.12, 0]}><cylinderGeometry args={[0.01, 0.01, 0.24, 4]} /><Toon color={INK} outline={false} /></mesh>
        <mesh position={[0, -0.45, 0]} scale={[1, 0.85, 1]}><sphereGeometry args={[0.25, 14, 10]} /><Toon color={color} emissive={color} emissiveIntensity={0.35} /></mesh>
        <Box at={[0, -0.24, 0]} size={[0.22, 0.05, 0.22]} color={candy.mustard} outline={false} />
        <Box at={[0, -0.66, 0]} size={[0.22, 0.05, 0.22]} color={candy.mustard} outline={false} />
        {Boolean(params.tassels) && <mesh position={[0, -0.82, 0]}><cylinderGeometry args={[0.03, 0.01, 0.25, 6]} /><Toon color={color} outline={false} /></mesh>}
      </group>
    </group>)}
  </group>;
};

export const storefrontAssets: Record<string, AssetComponent> = {
  'sf.door.wood': WoodDoor, 'sf.door.glass': GlassDoor, 'sf.window.shop': ShopWindow, 'sf.window.lattice': LatticeWindow,
  'sf.awning.striped': StripedAwning, 'sf.awning.canopy': FlatCanopy, 'sf.counter.takeaway': TakeawayCounter,
  'sf.sign.vertical': VerticalSign, 'sf.sign.horizontal': HorizontalSign, 'sf.sign.neon': NeonSign,
  'sf.shutter.rolling': RollingShutter, 'sf.lantern.pair': LanternPair,
};
