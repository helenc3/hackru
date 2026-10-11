import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, GradientTexture, Sparkles } from '@react-three/drei';
import { BackSide, CanvasTexture, Color, Matrix4, Object3D, type BufferGeometry, type Group, type InstancedMesh, type MeshBasicMaterial } from 'three';
import type { Position, PublicState } from '@vibequest/shared';
import { candy, INK, Toon, useReducedMotion } from './toon';

/** Purely decorative, non-colliding scenery. Nothing here touches gameplay state. */
type Vec3 = [number, number, number];
type Look = React.RefObject<{ position: Position }>;
/** [x, y, z, scaleX, scaleY, scaleZ, rotX, rotY, rotZ] — unit geometry, scaled per instance. */
type Place = readonly number[];

const dummy = new Object3D();
const tmp = new Matrix4(), pivot = new Matrix4(), turn = new Matrix4(), back = new Matrix4();
const tint = new Color();
function compose(p: Place, out: Matrix4) {
  dummy.position.set(p[0], p[1], p[2]);
  dummy.scale.set(p[3] ?? 1, p[4] ?? 1, p[5] ?? 1);
  dummy.rotation.set(p[6] ?? 0, p[7] ?? 0, p[8] ?? 0);
  dummy.updateMatrix();
  return out.copy(dummy.matrix);
}

/**
 * One instanced draw (+ one outline draw) for many same-material pieces. `tints` gives per-instance
 * colors; `sway` ([pivotX, pivotY, pivotZ, phase] per item) gives a slow ±.03 rad canopy rock at 0.35 Hz.
 */
function Batch({ items, color = '#ffffff', tints, outline = true, thickness, sway, still, children }: {
  items: readonly Place[]; color?: string; tints?: readonly string[]; outline?: boolean; thickness?: number;
  sway?: readonly Place[]; still?: boolean; children: ReactNode;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((p, i) => { m.setMatrixAt(i, compose(p, tmp)); if (tints) m.setColorAt(i, tint.set(tints[i])); });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    // drei's Outlines hull is a child InstancedMesh with no instance bounds; it would be culled
    // against a unit box at the origin. Static scenery is cheap, so skip culling for the whole batch.
    m.traverse((node) => { node.frustumCulled = false; });
  }, [items, tints, still]);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m || !sway || still) return;
    const t = clock.elapsedTime;
    items.forEach((p, i) => {
      const [px, py, pz, phase] = sway[i];
      pivot.makeTranslation(px, py, pz).multiply(turn.makeRotationZ(.03 * Math.sin(t * 2.2 + phase))).multiply(back.makeTranslation(-px, -py, -pz)).multiply(compose(p, tmp));
      m.setMatrixAt(i, pivot);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]}>{children}<Toon color={color} outline={outline} thickness={thickness} /></instancedMesh>;
}

/** Hides overhead roofs while they sit between the camera and the player, so cover never hides the avatar. */
function useClearView(group: React.RefObject<Group | null>, player: Look, b: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number }) {
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const p = player.current.position, c = camera.position, body = 1;
    const crosses = (y: number) => {
      const t = (c.y - y) / (c.y - body);
      if (!(t > 0 && t < 1)) return false;
      const x = c.x + (p.x - c.x) * t, z = c.z + (p.z - c.z) * t;
      return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
    };
    g.visible = !(crosses(b.minY) || crosses(b.maxY));
  });
}

const skyStops = [0, .45, .75, 1];
const skyColors = [candy.sky, '#bfe6ff', candy.peach, '#ffb98a'];
/** Painterly dome: canvas gradient stop 0 lands on v=1 (the top), so blue is up and peach rings the horizon. */
export function Sky() {
  return <mesh renderOrder={-1}>
    <sphereGeometry args={[50, 14, 10]} />
    <meshBasicMaterial side={BackSide} fog={false} depthWrite={false} toneMapped={false}><GradientTexture stops={skyStops} colors={skyColors} attach="map" /></meshBasicMaterial>
  </mesh>;
}

const grassBand: Place[] = [[0, -.025, 19.4, 40, .01, 1.2], [0, -.025, -19.4, 40, .01, 1.2], [19.4, -.025, 0, 1.2, .01, 40], [-19.4, -.025, 0, 1.2, .01, 40]];
const tiles: Place[] = [10.5, 13.5, 16.5].flatMap((z, row) => [-12, -8, -4, 0, 4, 8, 12].map((x) => [x + (row % 2) * .6, .005, z, 1.6, .01, 1.6]));
const rails: Place[] = [[0, .02, -19.4, 32, .04, .08], [0, .02, -19.9, 32, .04, .08]];
const sleepers: Place[] = Array.from({ length: 27 }, (_, i) => [-15.6 + i * 1.2, .012, -19.65, .2, .024, .95]);
export function Ground() {
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.03, 0]}><planeGeometry args={[40, 40]} /><Toon color={candy.grass} outline={false} /></mesh>
    <Batch items={grassBand} color={candy.grassDeep} outline={false}><boxGeometry /></Batch>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[30, 36]} /><Toon color={candy.sand} outline={false} /></mesh>
    <Batch items={tiles} color="#ecd096" outline={false}><boxGeometry /></Batch>
    <Batch items={sleepers} color={candy.bark} outline={false}><boxGeometry /></Batch>
    <Batch items={rails} color={candy.inkSoft} outline={false}><boxGeometry /></Batch>
  </>;
}

// Soft radial falloff for the lantern glow (alphaMap reads the green channel): white core → black rim.
let halo: CanvasTexture | undefined;
function haloTexture() {
  if (!halo) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.3, '#8c8c8c'); g.addColorStop(.7, '#1c1c1c'); g.addColorStop(1, '#000000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    halo = new CanvasTexture(c);
  }
  return halo;
}

/** Red lantern: squashed glowing body, ink cord/caps rod, lemon tassel, soft billboard halo as fake bloom. */
export function Lantern({ at, drop = .4, phase, still }: { at: Vec3; drop?: number; phase: number; still: boolean }) {
  const swing = useRef<Group>(null);
  const halo = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (still || !swing.current || !halo.current) return;
    const t = clock.elapsedTime + phase;
    swing.current.rotation.z = .08 * Math.sin(t * 1.6);
    swing.current.rotation.x = .05 * Math.sin(t * 1.1 + 1);
    halo.current.opacity = .55 + .1 * Math.sin(t * 2.4);
  });
  const rod = drop + .23;
  return <group ref={swing} position={at}>
    <mesh position={[0, -rod / 2, 0]}><cylinderGeometry args={[.045, .045, rod, 8]} /><Toon color={INK} outline={false} /></mesh>
    <mesh position={[0, -drop, 0]} scale={[1, .85, 1]}><sphereGeometry args={[.22, 12, 9]} /><Toon color={candy.lantern} emissive={candy.lantern} emissiveIntensity={.9} /></mesh>
    <mesh position={[0, -drop - .36, 0]}><capsuleGeometry args={[.035, .18, 2, 6]} /><Toon color={candy.lemon} outline={false} /></mesh>
    <Billboard position={[0, -drop, 0]}>
      <mesh><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial ref={halo} color="#ff6b5e" alphaMap={haloTexture()} transparent opacity={.55} depthWrite={false} toneMapped={false} /></mesh>
    </Billboard>
  </group>;
}

const eaves: Place[] = [
  ...Array.from({ length: 6 }, (_, i) => [-14.5 + i * 1.6, 2.62, 1.52, 1.5, .12, .55, .35]),
  [-10.5, 2.84, 5.25, 9.8, .16, .22], // ridge beam
];
const finials: Place[] = [[-15.4, 2.98, 5.25, .14, .42, .14, 0, 0, .5], [-5.6, 2.98, 5.25, .14, .42, .14, 0, 0, -.5]];
// North-wall trims on both faces (inner z 8, plaza side z 8.5), plus the closed side door on the west wall.
const faces = [[7.95, 7.91], [8.55, 8.59]];
const frames: Place[] = [
  ...faces.flatMap(([z]) => [[-12.6, 1.25, z, 1.5, 1.1, .06], [-7.4, 1.25, z, 1.5, 1.1, .06], [-10, 1, z, 1.3, 2, .06]]),
  [-14.45, 1, 4, 1.3, 2, .06, 0, Math.PI / 2],
];
const panes: Place[] = faces.flatMap(([, z]) => [[-12.6, 1.25, z, 1.2, .8, .06], [-7.4, 1.25, z, 1.2, .8, .06]]);
const doors: Place[] = [...faces.map(([, z]) => [-10, .9, z, 1, 1.8, .06]), [-14.41, .9, 4, 1, 1.8, .06, 0, Math.PI / 2]];
const signRods: Place[] = [[-10.75, 2.32, 8.78, .03, .16, .03], [-9.25, 2.32, 8.78, .03, .16, .03]];
export function Cafe({ player, still }: { player: Look; still: boolean }) {
  const roof = useRef<Group>(null);
  useClearView(roof, player, { minX: -15.6, maxX: -5.4, minZ: 1.2, maxZ: 9, minY: 1.8, maxY: 3.1 });
  return <>
    <group ref={roof}>
      <mesh position={[-10.5, 2.575, 5.25]}><boxGeometry args={[9.6, .35, 7.1]} /><Toon color={candy.raspberry} thickness={3} /></mesh>
      <Batch items={eaves} color={candy.plum}><boxGeometry /></Batch>
      <Batch items={finials} color={candy.lemon}><coneGeometry args={[1, 1, 8]} /></Batch>
      <mesh position={[-10, 2.06, 8.78]}><boxGeometry args={[1.9, .42, .1]} /><Toon color={candy.lemon} /></mesh>
      <Batch items={signRods} color={INK} outline={false}><boxGeometry /></Batch>
      <Lantern at={[-15, 2.4, 1.85]} drop={.32} phase={0} still={still} />
      <Lantern at={[-6, 2.4, 1.85]} drop={.32} phase={1.3} still={still} />
    </group>
    <Batch items={frames} color={candy.cream} thickness={1.6}><boxGeometry /></Batch>
    <Batch items={panes} color={candy.teal} outline={false}><boxGeometry /></Batch>
    <Batch items={doors} color={candy.plum} outline={false}><boxGeometry /></Batch>
  </>;
}

const stripes: Place[] = Array.from({ length: 6 }, (_, i) => [5.5 + i, 2.45, 6.6, 1, .1, .9, -.36]);
const stripeTints = stripes.map((_, i) => (i % 2 ? candy.cream : candy.raspberry));
const kioskPosts: Place[] = [[5.1, 1.15, 6.3, .1, 2.3, .1], [10.9, 1.15, 6.3, .1, 2.3, .1]];
const goods: Place[] = [[5.9, 2.55, 7.25, .45, .3, .32], [6.9, 2.6, 7.25, .32, .4, .3], [8.1, 2.54, 7.25, .5, .28, .34], [9.2, 2.58, 7.25, .34, .36, .3], [10.2, 2.55, 7.25, .42, .3, .3]];
const goodsTints = [candy.coral, candy.teal, candy.mint, candy.lime, candy.blossom];
export function Kiosk({ player, still }: { player: Look; still: boolean }) {
  const awning = useRef<Group>(null);
  useClearView(awning, player, { minX: 4.8, maxX: 11.2, minZ: 5.9, maxZ: 7.1, minY: 1.7, maxY: 2.7 });
  return <>
    <group ref={awning}>
      <Batch items={stripes} tints={stripeTints}><boxGeometry /></Batch>
      <Lantern at={[5.4, 2.3, 6.25]} drop={.32} phase={2.1} still={still} />
      <Lantern at={[10.6, 2.3, 6.25]} drop={.32} phase={3.4} still={still} />
    </group>
    <Batch items={kioskPosts} color={candy.inkSoft}><boxGeometry /></Batch>
    <Batch items={goods} tints={goodsTints}><boxGeometry /></Batch>
  </>;
}

const platformXs = [-10, 0, 10];
const platformPosts: Place[] = platformXs.flatMap((x) => [
  ...[-3.3, 3.3].flatMap((dx) => [-15.8, -8.2].map((z) => [x + dx, 1.6, z, .12, 3.2, .12])),
  [x, 1.1, -16.5, .14, 2.2, .14], // number pylon
]);
const pylonBoards: Place[] = platformXs.map((x) => [x, 2.2, -16.5, 1.3, .55, .12]);
// Wordless platform number: n ink dots on the board (the DOM labels carry the Chinese names).
const pylonDots: Place[] = platformXs.flatMap((x, n) => Array.from({ length: n + 1 }, (_, i) => [x + (i - n / 2) * .3, 2.2, -16.42, .08, .08, .04]));
function Canopy({ x, player }: { x: number; player: Look }) {
  const roof = useRef<Group>(null);
  useClearView(roof, player, { minX: x - 3.8, maxX: x + 3.8, minZ: -16.3, maxZ: -7.7, minY: 3, maxY: 3.4 });
  return <group ref={roof}><mesh position={[x, 3.2, -12]}><boxGeometry args={[7.4, .2, 8.4]} /><Toon color={candy.teal} thickness={3} /></mesh></group>;
}
export function Platforms({ player }: { player: Look }) {
  return <>
    {platformXs.map((x) => <Canopy key={x} x={x} player={player} />)}
    <Batch items={platformPosts} color={candy.inkSoft}><boxGeometry /></Batch>
    <Batch items={pylonBoards} color={candy.lemon}><boxGeometry /></Batch>
    <Batch items={pylonDots} color={INK} outline={false}><sphereGeometry args={[1, 8, 6]} /></Batch>
  </>;
}

const stringPosts: Place[] = [[-6, 1.75, 14, .14, 3.5, .14], [6, 1.75, 14, .14, 3.5, .14]];
export function LanternString({ still }: { still: boolean }) {
  return <>
    <Batch items={stringPosts} color={candy.inkSoft}><boxGeometry /></Batch>
    <mesh position={[0, 3.3, 14]}><boxGeometry args={[12, .04, .04]} /><Toon color={INK} outline={false} /></mesh>
    {[-4, -2, 0, 2, 4].map((x, i) => <Lantern key={x} at={[x, 3.3, 14]} phase={i * .9} still={still} />)}
  </>;
}

const treeSpots = [[-18.6, 17.5], [18.6, 17.5], [-18.6, 3], [18.6, 3], [-18.6, -5], [18.6, -5]];
const canopy = [[0, 2.7, 0, 1.15], [.75, 2.3, .35, .85], [-.7, 2.35, -.3, .9], [.1, 3.3, -.1, .8]];
function treeParts(kind: number, parts: number[][]) {
  const spots = treeSpots.map((spot, i) => [...spot, i]).filter((_, i) => i % 2 === kind);
  return {
    items: spots.flatMap(([x, z]) => parts.map(([dx, y, dz, r]) => [x + dx, y, z + dz, r, r, r])),
    sway: spots.flatMap(([x, z, i]) => parts.map(() => [x, 1.8, z, i * 1.7])),
  };
}
const blossom = treeParts(0, canopy), osmanthus = treeParts(1, canopy);
const under = [[0, 1.95, .15, .95]];
const blossomUnder = treeParts(0, under), osmanthusUnder = treeParts(1, under);
const trunks: Place[] = treeSpots.map(([x, z]) => [x, 1, z, 1, 2, 1]);
/** Cherry (pink) and osmanthus (gold) blobs on the outer edges, where nobody walks. */
export function Trees({ still }: { still: boolean }) {
  return <>
    <Batch items={trunks} color={candy.bark}><cylinderGeometry args={[.18, .26, 1, 10]} /></Batch>
    <Batch items={blossom.items} sway={blossom.sway} still={still} color={candy.blossom}><sphereGeometry args={[1, 14, 10]} /></Batch>
    <Batch items={osmanthus.items} sway={osmanthus.sway} still={still} color={candy.osmanthus}><sphereGeometry args={[1, 14, 10]} /></Batch>
    <Batch items={blossomUnder.items} sway={blossomUnder.sway} still={still} color="#e98bbd" outline={false}><sphereGeometry args={[1, 12, 8]} /></Batch>
    <Batch items={osmanthusUnder.items} sway={osmanthusUnder.sway} still={still} color="#e8b64a" outline={false}><sphereGeometry args={[1, 12, 8]} /></Batch>
  </>;
}

/** Chunky ink post with a lemon board (sign) or a teal horn speaker (PA); same spot as before. */
export function Sign({ target, phase, still }: { target: PublicState['interactables'][number]; phase: number; still: boolean }) {
  const head = useRef<Group>(null);
  useFrame(({ clock }) => { if (!still && head.current) head.current.rotation.y = .02 * Math.sin(clock.elapsedTime * 1.3 + phase); });
  return <group position={[target.position.x, 0, target.position.z]}>
    <mesh position={[.6, .7, 0]}><boxGeometry args={[.14, 1.4, .14]} /><Toon color={candy.inkSoft} /></mesh>
    <group ref={head} position={[.6, 1.4, 0]}>
      {target.kind === 'sign'
        ? <mesh><boxGeometry args={[1, .6, .1]} /><Toon color={candy.lemon} thickness={3} /></mesh>
        : <>
          <mesh position={[0, 0, -.02]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.1, .1, .22, 10]} /><Toon color={candy.teal} outline={false} /></mesh>
          <mesh position={[0, 0, .2]} rotation={[-Math.PI / 2, 0, 0]}><coneGeometry args={[.24, .3, 12]} /><Toon color={candy.teal} /></mesh>
        </>}
    </group>
  </group>;
}

const PETALS = 110;
const rand = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Falling cherry petals confined to the plaza (x -16..16, z 3..17); respawn at y 6. */
export function Petals() {
  const geometry = useRef<BufferGeometry>(null);
  const seeds = useMemo(() => Array.from({ length: PETALS }, (_, i) => ({ x: -15.4 + rand(i) * 30.8, z: 3.4 + rand(i + 300) * 13.2, fall: .35 + rand(i + 600) * .25, phase: rand(i + 900) * 6.28 })), []);
  const positions = useMemo(() => new Float32Array(seeds.flatMap((s, i) => [s.x, .1 + rand(i + 1200) * 5.9, s.z])), [seeds]);
  useFrame(({ clock }, delta) => {
    const attr = geometry.current?.getAttribute('position');
    if (!attr) return;
    const t = clock.elapsedTime, step = Math.min(delta, .1);
    seeds.forEach((s, i) => {
      let y = attr.getY(i) - s.fall * step;
      if (y < .1) y = 6;
      attr.setXYZ(i, s.x + Math.sin(t * .8 + s.phase) * .6, y, s.z + Math.cos(t * .6 + s.phase) * .4);
    });
    attr.needsUpdate = true;
  });
  return <points frustumCulled={false}>
    <bufferGeometry ref={geometry}><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial size={.18} sizeAttenuation color={candy.blossom} transparent depthWrite={false} toneMapped={false} />
  </points>;
}

export function Twinkles() {
  return <Sparkles count={60} scale={[30, 5, 12]} position={[0, 3, 10]} size={3} speed={.35} color={candy.lemon} opacity={.7} />;
}

/** Bouncing "!" above the nearest interactable. Static under reduced motion. */
export function Cue({ at }: { at?: Position }) {
  const still = useReducedMotion();
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = 2.3 + (still ? 0 : .12 * Math.sin(clock.elapsedTime * Math.PI * 4)); });
  if (!at) return null;
  return <group ref={ref} position={[at.x, 2.3, at.z]}>
    <mesh position={[0, .2, 0]}><boxGeometry args={[.14, .42, .14]} /><Toon color={candy.lemon} thickness={3} /></mesh>
    <mesh position={[0, -.15, 0]}><sphereGeometry args={[.09, 10, 8]} /><Toon color={candy.lemon} thickness={3} /></mesh>
  </group>;
}
