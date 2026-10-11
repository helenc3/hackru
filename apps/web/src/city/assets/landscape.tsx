import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { treeHeightScale } from '@vibequest/shared';
import { candy, INK, Toon } from '../../world/toon';
import type { AssetComponent, AssetProps } from './types';

// Landscaping kit. Sizes mirror packages/shared/src/city/catalog/landscape.ts footprints.
const n = (props: AssetProps, key: string) => props.params[key] as number;
const rand = (seed: number, i: number) => { const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return s - Math.floor(s); };
const foliage = { summer: ['#7fcf5c', '#5fb043'], autumn: ['#f0b64a', '#d9823b'], spring: ['#b6e88a', '#ffc4de'] } as const;
type Season = keyof typeof foliage;

/** Slow canopy rock, matching decor.tsx trees (±.03 rad, 0.35 Hz); off when motion is reduced. */
function Sway({ still, phase, children }: { still: boolean; phase: number; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => { if (!still && ref.current) ref.current.rotation.z = .03 * Math.sin(clock.elapsedTime * 2.2 + phase); });
  return <group ref={ref} userData={{ clearView: 'fade', batch: 'self' }}>{children}</group>;
}
function Blob({ at, r, color, outline = true }: { at: [number, number, number]; r: number; color: string; outline?: boolean }) {
  return <mesh position={at} scale={r}><sphereGeometry args={[1, 12, 9]} /><Toon color={color} outline={outline} /></mesh>;
}
function Trunk({ height, radius, color = candy.bark }: { height: number; radius: number; color?: string }) {
  return <mesh position={[0, height / 2, 0]} userData={{ clearView: 'solid' }}><cylinderGeometry args={[radius * .7, radius, height, 10]} /><Toon color={color} /></mesh>;
}

const PlaneTree: AssetComponent = (props) => {
  const s = n(props, 'scale'), [main, deep] = foliage[props.params.season as Season], tall = props.params.variant === 'tall';
  return <group scale={[s, treeHeightScale(s) * .85, s]}>
    <Trunk height={4.4} radius={.28} color="#d9cbb0" />
    <Sway still={props.still || props.lod > 0} phase={props.seed}>
      <Blob at={[0, tall ? 5.6 : 5.2, 0]} r={1.6} color={main} />
      <Blob at={[1.1, 4.7, .35]} r={1.3} color={deep} />
      <Blob at={[-1.1, 4.8, -.35]} r={1.3} color={main} />
    </Sway>
  </group>;
};
const CamphorTree: AssetComponent = (props) => {
  const s = n(props, 'scale'), [main, deep] = foliage[props.params.season as Season];
  return <group scale={[s, treeHeightScale(s) * .85, s]}>
    <Trunk height={2.4} radius={.3} />
    <Sway still={props.still || props.lod > 0} phase={props.seed}>
      <Blob at={[0, 3.6, 0]} r={1.7} color={props.params.season === 'summer' ? '#3f8f3a' : main} />
      <Blob at={[1.05, 3, .35]} r={1.25} color={deep} />
      <Blob at={[-1.05, 3.1, -.35]} r={1.25} color={main} />
    </Sway>
  </group>;
};
const WillowTree: AssetComponent = (props) => {
  const s = n(props, 'scale'), [main, deep] = foliage[props.params.season as Season];
  return <group scale={[s, treeHeightScale(s) * .85, s]}>
    <Trunk height={3.2} radius={.22} />
    <Sway still={props.still || props.lod > 0} phase={props.seed}>
      <Blob at={[0, 3.8, 0]} r={1.35} color={main} />
      <Blob at={[.85, 3.2, .3]} r={1.05} color={deep} />
      <Blob at={[-.85, 3.3, -.3]} r={1.05} color={main} />
    </Sway>
  </group>;
};
const OsmanthusTree: AssetComponent = (props) => {
  const s = n(props, 'scale'), bloom = props.params.bloom === true;
  const main = bloom ? candy.osmanthus : foliage[props.params.season as Season][0];
  return <group scale={[s, treeHeightScale(s) * .85, s]}>
    <Trunk height={2} radius={.2} />
    <Sway still={props.still || props.lod > 0} phase={props.seed}>
      <Blob at={[0, 2.7, 0]} r={1.15} color={main} />
      <Blob at={[.65, 2.3, .3]} r={.85} color={main} />
      <Blob at={[-.65, 2.35, -.3]} r={.85} color={main} />
    </Sway>
  </group>;
};
const Shrub: AssetComponent = (props) => {
  const d = n(props, 'size');
  return <group>
    <Blob at={[0, d * .4, 0]} r={d / 2} color="#5fb043" />
    {props.params.flowering === true && [0, 1, 2, 3].map((i) => <Blob key={i} at={[Math.cos(i * 1.7) * d * .35, d * .55 + rand(props.seed, i) * d * .2, Math.sin(i * 1.7) * d * .35]} r={d * .1} color={candy.blossom} outline={false} />)}
  </group>;
};
const Hedge: AssetComponent = (props) => {
  const l = n(props, 'length'), h = n(props, 'height');
  return <mesh position={[0, h / 2, 0]}><boxGeometry args={[l, h, .8]} /><Toon color="#4f9e3d" /></mesh>;
};
const Planter: AssetComponent = (props) => {
  const l = n(props, 'length'), plant = props.params.plant;
  return <group>
    <mesh position={[0, .3, 0]}><boxGeometry args={[l, .6, .9]} /><Toon color={candy.silver} /></mesh>
    {plant === 'bamboo'
      ? Array.from({ length: Math.round(l * 3) }, (_, i) => <mesh key={i} position={[-l / 2 + .2 + i * (l - .4) / Math.max(1, Math.round(l * 3) - 1), 1.5, (rand(props.seed, i) - .5) * .4]}><cylinderGeometry args={[.04, .05, 1.8, 6]} /><Toon color="#6fbf4a" outline={false} /></mesh>)
      : <mesh position={[0, .72, 0]} scale={[l - .15, .3, .75]}><sphereGeometry args={[.5, 10, 6]} /><Toon color={plant === 'flowers' ? candy.raspberry : '#7fcf5c'} outline={false} /></mesh>}
  </group>;
};
const Lawn: AssetComponent = (props) => {
  const w = n(props, 'width'), d = n(props, 'depth');
  return <group>
    <mesh position={[0, .03, 0]}><boxGeometry args={[w, .06, d]} /><Toon color={candy.grass} outline={false} /></mesh>
    <mesh position={[0, .02, 0]}><boxGeometry args={[w + .3, .04, d + .3]} /><Toon color={candy.paving} outline={false} /></mesh>
  </group>;
};
const Pavilion: AssetComponent = (props) => {
  const size = n(props, 'size'), h = size / 2 - .25, red = props.params.roof === 'red';
  return <group>
    <mesh position={[0, .1, 0]}><boxGeometry args={[size, .2, size]} /><Toon color={candy.cream} /></mesh>
    {[[-h, -h], [h, -h], [-h, h], [h, h]].map(([x, z], i) => <mesh key={i} position={[x, 1.5, z]} userData={{ clearView: 'solid' }}><cylinderGeometry args={[.15, .15, 2.8, 8]} /><Toon color={candy.lantern} /></mesh>)}
    <group userData={{ clearView: 'fade' }}>
      <mesh position={[0, 3.05, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[size * .82, 1.1, 4]} /><Toon color={red ? candy.raspberry : '#4b5563'} /></mesh>
      <mesh position={[0, 3.8, 0]}><sphereGeometry args={[.18, 8, 6]} /><Toon color={candy.lemon} /></mesh>
    </group>
  </group>;
};
const courtyardColors = { stone: ['#d8d2c4', '#c7c0b0'], brick: ['#c97a5a', '#b4674a'], checker: ['#ece4d2', INK] } as const;
const Courtyard: AssetComponent = (props) => {
  const w = n(props, 'width'), d = n(props, 'depth'), [a, b] = courtyardColors[props.params.pattern as keyof typeof courtyardColors];
  const tiles = props.lod === 0 ? Math.min(8, Math.floor(w / 2)) : 0;
  return <group>
    <mesh position={[0, .025, 0]}><boxGeometry args={[w, .05, d]} /><Toon color={a} outline={false} /></mesh>
    {Array.from({ length: tiles }, (_, i) => <mesh key={i} position={[-w / 2 + (i + .5) * w / tiles, .052, 0]}><boxGeometry args={[w / tiles * .5, .006, d * .96]} /><Toon color={b} outline={false} /></mesh>)}
  </group>;
};
const bloomPalettes = { red: [candy.lantern, candy.raspberry], yellow: [candy.lemon, candy.osmanthus], mixed: [candy.blossom, candy.lemon, candy.coral] } as const;
const Flowerbed: AssetComponent = (props) => {
  const w = n(props, 'width'), d = n(props, 'depth'), palette = bloomPalettes[props.params.palette as keyof typeof bloomPalettes];
  const count = props.lod === 0 ? Math.round(w * d * 2) : 0;
  return <group>
    <mesh position={[0, .15, 0]}><boxGeometry args={[w, .3, d]} /><Toon color={candy.silver} /></mesh>
    <mesh position={[0, .32, 0]}><boxGeometry args={[w - .2, .06, d - .2]} /><Toon color="#7a5a3c" outline={false} /></mesh>
    {Array.from({ length: count }, (_, i) => <mesh key={i} position={[(rand(props.seed, i) - .5) * (w - .4), .42, (rand(props.seed, i + 99) - .5) * (d - .4)]}><sphereGeometry args={[.12, 6, 4]} /><Toon color={palette[i % palette.length]!} outline={false} /></mesh>)}
  </group>;
};
const Rocks: AssetComponent = (props) => {
  const size = n(props, 'size'), rocks = n(props, 'rocks');
  return <group>
    <mesh position={[0, .03, 0]}><boxGeometry args={[size, .06, size]} /><Toon color="#e6dfcf" outline={false} /></mesh>
    {Array.from({ length: rocks }, (_, i) => {
      const r = .3 + rand(props.seed, i) * .35, a = i / rocks * Math.PI * 2;
      return <mesh key={i} position={[Math.cos(a) * size * .28, r * 1.3, Math.sin(a) * size * .28]} scale={[r, r * (1.6 + rand(props.seed, i + 7)), r]} rotation={[0, a, .2]}><dodecahedronGeometry args={[1, 0]} /><Toon color="#a8a2b4" /></mesh>;
    })}
  </group>;
};

export const landscapeAssets: Record<string, AssetComponent> = {
  'ls.tree.plane': PlaneTree, 'ls.tree.camphor': CamphorTree, 'ls.tree.willow': WillowTree, 'ls.tree.osmanthus': OsmanthusTree,
  'ls.shrub.round': Shrub, 'ls.shrub.hedge': Hedge, 'ls.planter.box': Planter, 'ls.park.lawn': Lawn, 'ls.park.pavilion': Pavilion,
  'ls.courtyard.tiles': Courtyard, 'ls.flowerbed': Flowerbed, 'ls.rock.garden': Rocks,
};
