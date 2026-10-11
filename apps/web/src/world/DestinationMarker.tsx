import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { Position } from '@vibequest/shared';
import type { Runtime } from './runtime';
import { candy, INK, useReducedMotion } from './toon';

/** A candy-colored landing dot with a soft lantern-like ripple. */
export function DestinationMarker({ runtime }: { runtime: React.RefObject<Runtime> }) {
  const group = useRef<Group>(null);
  const dot = useRef<Mesh>(null);
  const ripple = useRef<Mesh>(null);
  const dotMaterial = useRef<MeshBasicMaterial>(null);
  const borderMaterial = useRef<MeshBasicMaterial>(null);
  const rippleMaterial = useRef<MeshBasicMaterial>(null);
  const animation = useRef<{ destination: Position | null; age: number; fade: number }>({ destination: null, age: 0, fade: 0 });
  const still = useReducedMotion();

  useFrame((_, delta) => {
    if (!group.current || !dot.current || !ripple.current) return;
    const path = runtime.current.path;
    const destination = path?.[path.length - 1];
    const a = animation.current;
    if (destination && destination !== a.destination) {
      a.destination = destination;
      a.age = 0;
      group.current.position.set(destination.x, .065, destination.z);
    }
    a.age += delta;
    a.fade = destination ? 1 : Math.max(0, a.fade - delta / .35);
    group.current.visible = a.fade > 0;
    if (!group.current.visible) return;
    // A quick squash-and-settle on click, followed by gentle breathing.
    const pop = still ? 1 : 1 - Math.exp(-a.age * 12) * Math.cos(a.age * 18);
    const breath = still ? 1 : 1 + .06 * Math.sin(a.age * 4);
    dot.current.scale.setScalar(pop * breath);
    const phase = still ? .35 : (a.age % 1.2) / 1.2;
    ripple.current.scale.setScalar(1 + phase * 1.8);
    if (dotMaterial.current) dotMaterial.current.opacity = a.fade;
    if (borderMaterial.current) borderMaterial.current.opacity = a.fade;
    if (rippleMaterial.current) rippleMaterial.current.opacity = a.fade * (still ? .45 : .65 * (1 - phase));
  });

  return <group ref={group} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
    <mesh ref={dot}>
      <circleGeometry args={[.19, 32]} />
      <meshBasicMaterial ref={dotMaterial} color={candy.lemon} transparent depthWrite={false} toneMapped={false} />
      <mesh position={[0, 0, -.001]}>
        <ringGeometry args={[.19, .235, 32]} />
        <meshBasicMaterial ref={borderMaterial} color={INK} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </mesh>
    <mesh ref={ripple}>
      <ringGeometry args={[.28, .32, 48]} />
      <meshBasicMaterial ref={rippleMaterial} color={candy.lemon} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}
