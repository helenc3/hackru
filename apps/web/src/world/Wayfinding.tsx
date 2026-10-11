import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { Position, QuestTarget } from '@vibequest/shared';
import type { Runtime } from './runtime';

const CARDINALS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Screen-relative arrow, distance and compass heading to the quest target (north is −z). */
export function QuestCompass({ target, position, yaw, onWalk }: { target: QuestTarget; position: Position; yaw: number; onWalk: () => void }) {
  const dx = target.position.x - position.x, dz = target.position.z - position.z;
  const metres = Math.round(Math.hypot(dx, dz));
  // Camera right is (cos yaw, −sin yaw) and forward is (−sin yaw, −cos yaw), matching movePlayer.
  const angle = Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), -dx * Math.sin(yaw) - dz * Math.cos(yaw)) * 180 / Math.PI;
  const [arrow, setArrow] = useState({ angle, rotation: angle });
  if (arrow.angle !== angle) {
    // Keep the CSS rotation continuous across ±180°, including repeated full turns.
    const delta = ((angle - arrow.angle + 540) % 360) - 180;
    setArrow({ angle, rotation: arrow.rotation + delta });
  }
  const heading = CARDINALS[Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8];
  return <div className="quest-compass" data-testid="quest-compass" data-distance={metres} role="status" aria-label={`Quest target: ${target.english}, ${metres} metres ${heading}`}>
    {metres > 2 && <svg className="quest-compass-arrow" aria-hidden="true" viewBox="0 0 24 24" style={{ transform: `rotate(${arrow.rotation}deg)` }}><path d="M12 2 3 12h6v10h6V12h6Z" fill="currentColor" /></svg>}
    <span className="quest-compass-text">{metres <= 2 ? 'here' : `${metres} m ${heading}`}</span>
    {metres > 2 && <button type="button" className="button secondary" data-testid="walk-there" onClick={onWalk}>Walk there</button>}
  </div>;
}

/** A tall light beam over the quest target, unaffected by fog so it reads from across the district. */
export function QuestBeacon({ target, still }: { target: Position; still: boolean }) {
  const beam = useRef<Mesh>(null);
  useFrame(({ clock }) => { if (beam.current && !still) beam.current.scale.x = beam.current.scale.z = 1 + Math.sin(clock.elapsedTime * 2) * .15; });
  return <mesh ref={beam} position={[target.x, 14, target.z]}>
    <cylinderGeometry args={[.45, .45, 28, 12, 1, true]} />
    <meshBasicMaterial color="#ffd166" transparent opacity={.5} depthWrite={false} fog={false} />
  </mesh>;
}

/**
 * The Huangpu corridor as a far, fog-free water strip under the streamed chunks, so the river is
 * visible before its chunks load. Loaded chunk ground and water draw over it.
 */
export function FarRiver({ river, runtime }: { river: { center: number; width: number }; runtime: React.RefObject<Runtime> }) {
  const strip = useRef<Mesh>(null);
  useFrame(() => { if (strip.current) strip.current.position.z = runtime.current.position.z; });
  return <mesh ref={strip} rotation={[-Math.PI / 2, 0, 0]} position={[river.center, -.04, 0]}>
    <planeGeometry args={[river.width, 600]} />
    <meshBasicMaterial color="#5fb3dd" fog={false} />
  </mesh>;
}
