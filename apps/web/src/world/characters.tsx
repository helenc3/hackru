import { useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Matrix4, type EulerOrder, type Group, type Mesh } from 'three';
import type { Position } from '@vibequest/shared';
import { Toon, candy, INK, useReducedMotion } from './toon';

export type Gait = { moving: boolean; speed: number };

// Chibi proportions: feet at y=0, head (r .4) centred at 1.35, top of head ~1.75 => head ≈ 46% of height.
const HEAD_Y = 1.35, HEAD_R = .4, HIP_Y = .4, SHOULDER_Y = .98, ARM_Z = .15;

type Spring = { x: number; v: number };
/** Damped spring, sub-stepped so large deltas stay stable. Mutates `s`. */
function spring(s: Spring, target: number, dt: number, stiffness: number, damping: number) {
  for (let left = dt; left > 0; left -= 1 / 60) {
    const h = Math.min(left, 1 / 60);
    s.v += (stiffness * (target - s.x) - damping * s.v) * h;
    s.x += s.v * h;
  }
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type Rng = { seed: number };
const rand = (r: Rng) => (r.seed = (r.seed * 16807) % 2147483647) / 2147483647;

type Blink = { t: number; next: number; double: boolean };
/** Returns eye Y scale: 1 open, .08 shut. ~120 ms blinks every 2.5–5 s, sometimes doubled. */
function stepBlink(b: Blink, rng: Rng, dt: number): number {
  b.t += dt;
  if (b.t < b.next) return 1;
  const c = b.t - b.next;
  if (c < .12) return .08 + .92 * Math.abs(c / .06 - 1);
  b.t = 0;
  if (b.double) { b.double = false; b.next = .1; } else { b.next = 2.5 + rand(rng) * 2.5; b.double = rand(rng) < .2; }
  return 1;
}

/** Position + orientation of a decal sitting `lift` outside the head sphere along direction (dx, dy, +z). */
function surface(dx: number, dy: number, lift = .02): { position: [number, number, number]; rotation: [number, number, number, EulerOrder] } {
  const dz = Math.sqrt(1 - dx * dx - dy * dy), r = HEAD_R + lift;
  return { position: [dx * r, dy * r, dz * r], rotation: [-Math.asin(dy), Math.atan2(dx, dz), 0, 'YXZ'] };
}

function useRig() {
  return {
    root: useRef<Group>(null), squash: useRef<Group>(null), body: useRef<Group>(null), torso: useRef<Mesh>(null),
    head: useRef<Group>(null), hair: useRef<Group>(null), armL: useRef<Group>(null), armR: useRef<Group>(null),
    legL: useRef<Group>(null), legR: useRef<Group>(null), eyeL: useRef<Group>(null), eyeR: useRef<Group>(null), shadow: useRef<Mesh>(null),
  };
}
type RigRefs = ReturnType<typeof useRig>;

const footTransform = new Matrix4();
/** Lift the posed rig just enough to keep both capsule soles above the .05-high floors. */
function groundFeet(r: RigRefs) {
  const squash = r.squash.current, body = r.body.current;
  if (!squash || !body) return;
  squash.position.y = 0;
  squash.updateMatrix(); body.updateMatrix();
  let lowest = Infinity;
  for (const leg of [r.legL.current, r.legR.current]) {
    if (!leg) continue;
    leg.updateMatrix();
    footTransform.copy(squash.matrix).multiply(body.matrix).multiply(leg.matrix);
    const e = footTransform.elements;
    // Capsule center is -.2, its straight section is .14, and its radius is .1.
    // The Y-row norm also accounts for nonuniform squash and body/leg rotations.
    const radiusY = .1 * Math.hypot(e[1], e[5], e[9]);
    lowest = Math.min(lowest, e[13] - .2 * e[5] - .07 * Math.abs(e[5]) - radiusY);
  }
  if (Number.isFinite(lowest)) squash.position.y = Math.max(0, .065 - lowest);
}

/** Common per-frame pose: bob, squash about the feet, shadow shrink, blink. */
function base(r: RigRefs, bob: number, sq: number, blink: number) {
  r.squash.current?.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  r.body.current?.position.setY(bob);
  r.shadow.current?.scale.setScalar(1 - bob * 1.8);
  r.eyeL.current?.scale.setY(blink);
  r.eyeR.current?.scale.setY(blink);
}

/** Reduced-motion rest pose (head yaw is left to the look-at code). */
function rest(r: RigRefs) {
  base(r, 0, 1, 1);
  r.body.current?.rotation.set(0, 0, 0);
  r.torso.current?.scale.set(1, 1, 1);
  r.head.current?.position.setY(HEAD_Y);
  r.head.current?.rotation.set(0, r.head.current.rotation.y, 0);
  r.hair.current?.rotation.set(0, 0, 0);
  r.legL.current?.rotation.set(0, 0, 0);
  r.legR.current?.rotation.set(0, 0, 0);
  r.armL.current?.rotation.set(0, 0, ARM_Z);
  r.armR.current?.rotation.set(0, 0, -ARM_Z);
  groundFeet(r);
}

function Eye({ side, eye }: { side: 1 | -1; eye: RefObject<Group | null> }) {
  return <group {...surface(side * .38, -.05)}>
    <group ref={eye}>
      <mesh scale={[1, 1.15, 1]}><circleGeometry args={[.1, 14]} /><meshBasicMaterial color="#ffffff" /></mesh>
      <mesh position={[-side * .01, -.012, .003]} scale={[1, 1.12, 1]}><circleGeometry args={[.072, 14]} /><meshBasicMaterial color={INK} /></mesh>
      <mesh position={[side * .022, .03, .006]}><circleGeometry args={[.024, 8]} /><meshBasicMaterial color="#ffffff" /></mesh>
    </group>
  </group>;
}

/** Rounded hair cap; `h` squashes it vertically so hats can sit on top. */
function HairCap({ color, h = .8 }: { color: string; h?: number }) {
  return <mesh position={[0, .12, -.06]} scale={[1.04, h, 1.04]}><sphereGeometry args={[HEAD_R, 12, 10]} /><Toon color={color} /></mesh>;
}

type Look = { top: string; arms: string; legs: string; hair: ReactNode; head?: ReactNode; body?: ReactNode; hand?: ReactNode };

function Rig({ r, look }: { r: RigRefs; look: Look }) {
  return <group ref={r.root}>
    {/* Sits above the tallest walkable slab (.05) so it never sinks into café/platform floors. */}
    <mesh ref={r.shadow} rotation-x={-Math.PI / 2} position-y={.07}>
      <circleGeometry args={[.45, 16]} /><meshBasicMaterial color={INK} transparent opacity={.28} depthWrite={false} />
    </mesh>
    <group ref={r.squash}><group ref={r.body}>
      {([[r.legL, .12], [r.legR, -.12]] as const).map(([ref, x]) => <group key={x} ref={ref} position={[x, HIP_Y, 0]}>
        <mesh position-y={-.2}><capsuleGeometry args={[.1, .14, 4, 8]} /><Toon color={look.legs} /></mesh>
      </group>)}
      <mesh ref={r.torso} position-y={.7}><capsuleGeometry args={[.22, .3, 4, 8]} /><Toon color={look.top} /></mesh>
      <group ref={r.armL} position={[.29, SHOULDER_Y, 0]} rotation-z={ARM_Z}>
        <mesh position-y={-.17}><capsuleGeometry args={[.075, .2, 4, 8]} /><Toon color={look.arms} /></mesh>
      </group>
      <group ref={r.armR} position={[-.29, SHOULDER_Y, 0]} rotation-z={-ARM_Z}>
        <mesh position-y={-.17}><capsuleGeometry args={[.075, .2, 4, 8]} /><Toon color={look.arms} /></mesh>
        {look.hand}
      </group>
      {look.body}
      <group ref={r.head} position-y={HEAD_Y}>
        <mesh><sphereGeometry args={[HEAD_R, 12, 10]} /><Toon color={candy.skin} /></mesh>
        <Eye side={1} eye={r.eyeL} />
        <Eye side={-1} eye={r.eyeR} />
        <group {...surface(0, -.32)}>
          <mesh rotation-z={Math.PI}><torusGeometry args={[.06, .014, 4, 10, Math.PI]} /><meshBasicMaterial color={INK} /></mesh>
        </group>
        <group ref={r.hair}>{look.hair}</group>
        {look.head}
      </group>
    </group></group>
  </group>;
}

const PLAYER_LOOK: Look = {
  top: candy.coral, arms: candy.coral, legs: candy.teal,
  hair: <>
    <HairCap color={candy.lime} />
    {/* Spike-style crest: cones fanned upward and back from the crown. */}
    {[[.45, -.45, .9], [.15, -.65, 1.1], [-.15, -.65, 1.1], [-.45, -.45, .9]].map(([rz, rx, s]) =>
      <group key={rz} position={[0, .3, -.04]} rotation={[rx, 0, rz]}>
        <mesh position-y={.22 * s} scale={s}><coneGeometry args={[.13, .45, 6]} /><Toon color={candy.lime} /></mesh>
      </group>)}
  </>,
  body: <mesh position={[0, .74, -.25]}><boxGeometry args={[.34, .38, .16]} /><Toon color={candy.lemon} /></mesh>,
};

const NPC_LOOKS: Record<string, Look> = {
  xiaolin: {
    top: candy.cream, arms: candy.cream, legs: candy.inkSoft,
    hair: <><HairCap color={candy.plum} /><mesh position={[.34, .26, -.1]}><sphereGeometry args={[.17, 12, 10]} /><Toon color={candy.plum} /></mesh></>,
    body: <mesh position={[0, .6, .2]}><boxGeometry args={[.34, .42, .05]} /><Toon color="#ff6b8b" /></mesh>,
    hand: <mesh position={[0, -.4, .06]}><cylinderGeometry args={[.07, .055, .12, 8]} /><Toon color={candy.cream} /></mesh>,
  },
  achen: {
    top: candy.navy, arms: candy.navy, legs: candy.inkSoft,
    hair: <HairCap color={candy.inkSoft} h={.65} />,
    head: <>
      <mesh position={[0, .36, -.02]}><cylinderGeometry args={[.37, .4, .16, 12]} /><Toon color={candy.navy} /></mesh>
      <mesh position={[0, .29, .3]} scale={[1, 1, .7]}><cylinderGeometry args={[.24, .24, .03, 12]} /><Toon color={candy.navy} /></mesh>
      <mesh position={[0, .38, .37]}><sphereGeometry args={[.055, 8, 6]} /><Toon color={candy.lemon} thickness={1.5} /></mesh>
    </>,
  },
  laozhou: {
    top: candy.mustard, arms: candy.cream, legs: candy.inkSoft,
    hair: <HairCap color={candy.silver} h={.75} />,
    head: <>
      {([1, -1] as const).map((side) => <group key={side} {...surface(side * .38, -.05, .06)}>
        <mesh><torusGeometry args={[.12, .014, 4, 16]} /><meshBasicMaterial color={INK} /></mesh>
      </group>)}
      <group {...surface(0, -.22, .03)}><mesh><boxGeometry args={[.18, .04, .03]} /><Toon color={candy.silver} thickness={1.5} /></mesh></group>
    </>,
  },
};
const VILLAGER: Look = { top: candy.teal, arms: candy.cream, legs: candy.inkSoft, hair: <HairCap color={candy.inkSoft} /> };

/** Player rig, rendered at local origin facing +Z. The parent group owns world position and yaw. */
export function Player({ gait }: { gait: RefObject<Gait> }) {
  const r = useRig();
  const reduced = useReducedMotion();
  const st = useRef({ t: 0, phase: 0, move: 0, moving: false, prevBob: 0, sq: { x: 1, v: 0 }, head: { x: 0, v: 0 }, hair: { x: 0, v: 0 }, blink: { t: 0, next: 3, double: false }, rng: { seed: 7 } });
  useFrame((_, raw) => {
    if (reduced) { rest(r); return; }
    const dt = Math.min(raw, .1), s = st.current;
    const speed = gait.current?.moving ? gait.current.speed : 0;
    const moving = speed > .05;
    // Anticipation squash on start, settle squash (spring overshoots back) on stop.
    if (moving !== s.moving) { s.sq.v -= moving ? 2.2 : 1.6; s.moving = moving; }
    s.t += dt;
    s.move = MathUtils.damp(s.move, Math.min(speed / 4, 1), 8, dt);
    s.phase += speed * dt * 3.4;
    const m = s.move, sw = Math.sin(s.phase) * m;
    const breath = (1 - Math.cos(s.t * Math.PI * 2 * 1.6)) * .015;
    const bob = breath * (1 - m) + Math.abs(Math.sin(s.phase)) * .07 * m;
    const vy = (bob - s.prevBob) / Math.max(dt, 1e-4);
    s.prevBob = bob;
    spring(s.sq, 1 + MathUtils.clamp(vy * .12, -.08, .08), dt, 220, 14);
    spring(s.head, bob, dt, 90, 12);
    spring(s.hair, m * .45 + (bob - s.head.x) * 6, dt, 60, 7);
    base(r, bob, s.sq.x, stepBlink(s.blink, s.rng, dt));
    const tilt = Math.sin(s.phase) * .04 * m + Math.sin(s.t * 1.1) * .015 * (1 - m);
    r.body.current?.rotation.set(.12 * m, 0, tilt);
    r.legL.current?.rotation.set(sw * .6, 0, 0);
    r.legR.current?.rotation.set(-sw * .6, 0, 0);
    r.armL.current?.rotation.set(-sw * .45, 0, ARM_Z);
    r.armR.current?.rotation.set(sw * .45, 0, -ARM_Z);
    r.head.current?.position.setY(HEAD_Y + (s.head.x - bob) * .8);
    r.head.current?.rotation.set(-.05 * m, 0, -tilt * .6);
    r.hair.current?.rotation.set(-s.hair.x, 0, tilt * .8);
    groundFeet(r);
  });
  return <Rig r={r} look={PLAYER_LOOK} />;
}

/** NPC rig at local origin. `index` offsets idle phase; turns toward the player (`look`) within ~4.5 units of `offset`. */
export function Npc({ id, index, look, offset }: { id: 'xiaolin' | 'achen' | 'laozhou' | string; index: number; look: RefObject<{ position: Position }>; offset: Position }) {
  const r = useRig();
  const reduced = useReducedMotion();
  const st = useRef({
    t: 0, yaw: 0, headYaw: 0, inRange: false, hop: 1, prevBob: 0, sq: { x: 1, v: 0 }, hairZ: { x: 0, v: 0 }, hairX: { x: 0, v: 0 },
    blink: { t: 0, next: 1.5 + index * .9, double: false }, rng: { seed: 11 + index * 97 }, gesture: -1, nextGesture: 4 + index * 2.3,
  });
  useFrame((_, raw) => {
    const dt = Math.min(raw, .1), s = st.current;
    const p = look.current?.position;
    const dx = p ? p.x - offset.x : 0, dz = p ? p.z - offset.z : 0;
    const near = p !== undefined && Math.hypot(dx, dz) < 4.5;
    const target = near ? Math.atan2(dx, dz) : 0;
    s.yaw += wrap(target - s.yaw) * (1 - Math.exp(-6 * dt));
    s.headYaw = MathUtils.damp(s.headYaw, near ? MathUtils.clamp(wrap(target - s.yaw), -.5, .5) : 0, 9, dt);
    r.root.current?.rotation.set(0, s.yaw, 0);
    if (r.head.current) r.head.current.rotation.y = s.headYaw;
    if (near && !s.inRange) { s.hop = 0; s.sq.v -= 2.5; }
    s.inRange = near;
    if (reduced) { rest(r); return; }

    s.t += dt;
    s.hop += dt;
    const ph = s.t * Math.PI * 2 * (1.4 + index * .17) + index * 1.9;
    const bob = (1 - Math.cos(ph)) * .015 + (s.hop < .35 ? Math.sin(Math.PI * s.hop / .35) * .12 : 0);
    const vy = (bob - s.prevBob) / Math.max(dt, 1e-4);
    s.prevBob = bob;
    spring(s.sq, 1 + MathUtils.clamp(vy * .12, -.08, .08), dt, 220, 14);
    const tilt = Math.sin(s.t * .5 + index) * .06;
    spring(s.hairZ, tilt, dt, 40, 5);
    spring(s.hairX, -vy * .15, dt, 60, 6);
    base(r, bob, s.sq.x, stepBlink(s.blink, s.rng, dt));
    const breathe = 1 + Math.sin(ph) * .02;
    r.torso.current?.scale.set(breathe, 1, breathe);
    r.hair.current?.rotation.set(s.hairX.x, 0, s.hairZ.x - tilt);

    // Occasional ~.8 s gesture, eased in and out by a half-sine weight.
    s.nextGesture -= dt;
    if (s.gesture < 0 && s.nextGesture <= 0) s.gesture = 0;
    let w = 0;
    if (s.gesture >= 0) {
      s.gesture += dt;
      w = Math.sin(Math.PI * Math.min(s.gesture / .8, 1));
      if (s.gesture >= .8) { s.gesture = -1; s.nextGesture = 6 + rand(s.rng) * 4; }
    }
    let armRX = 0, armRZ = -ARM_Z, nod = 0;
    if (id === 'xiaolin') armRZ -= 2.5 * w - Math.sin(s.t * 14) * .35 * w; // wave
    else if (id === 'achen') { armRX = -2.5 * w; armRZ += .7 * w; nod = .15 * w; } // salute + nod
    else if (id === 'laozhou') { armRX = -2.3 * w; armRZ += .55 * w; nod = -.08 * w; } // adjust glasses
    else nod = .2 * w;
    r.armR.current?.rotation.set(armRX, 0, armRZ);
    r.armL.current?.rotation.set(0, 0, ARM_Z);
    r.head.current?.position.setY(HEAD_Y);
    r.head.current?.rotation.set(nod, s.headYaw, tilt);
    groundFeet(r);
  });
  return <Rig r={r} look={NPC_LOOKS[id] ?? VILLAGER} />;
}
