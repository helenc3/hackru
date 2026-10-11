import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, GradientTexture } from '@react-three/drei';
import { BackSide, CanvasTexture, type Group, type MeshBasicMaterial } from 'three';
import type { Position } from '@vibequest/shared';
import { candy, INK, Toon, useReducedMotion } from './toon';

/** Purely decorative, non-colliding scenery. Nothing here touches gameplay state. */
type Vec3 = [number, number, number];

const skyStops = [0, .45, .75, 1];
const skyColors = [candy.sky, '#bfe6ff', candy.peach, '#ffb98a'];
/** Painterly dome: canvas gradient stop 0 lands on v=1 (the top), so blue is up and peach rings the horizon. */
export function Sky() {
  return <mesh renderOrder={-1}>
    <sphereGeometry args={[50, 14, 10]} />
    <meshBasicMaterial side={BackSide} fog={false} depthWrite={false} toneMapped={false}><GradientTexture stops={skyStops} colors={skyColors} attach="map" /></meshBasicMaterial>
  </mesh>;
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
    const glow = .55 + .1 * Math.sin(t * 2.4);
    halo.current.userData.clearViewOpacity = glow;
    halo.current.opacity = glow * (halo.current.userData.clearViewFade ?? 1);
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
