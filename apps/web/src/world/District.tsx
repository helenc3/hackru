import { memo } from 'react';
import { sceneManifest, type PublicState } from '@vibequest/shared';
import { candy, INK, Toon, useReducedMotion } from './toon';
import { Npc } from './characters';
import { Cafe, Ground, Kiosk, LanternString, Petals, Platforms, Sign, Sky, Trees, Twinkles } from './decor';
import type { Runtime } from './runtime';
import { ClearView } from './ClearView';

function Shape({ x, z, width, depth, height, color, outline = true, thickness }: { x: number; z: number; width: number; depth: number; height: number; color: string; outline?: boolean; thickness?: number }) {
  return <mesh position={[x, height / 2, z]} userData={{ clearView: 'solid' }}><boxGeometry args={[width, height, depth]} /><Toon color={color} outline={outline} thickness={thickness} /></mesh>;
}

const colliderColor = (id: string) => (id.startsWith('cafe') ? candy.coral : id.startsWith('kiosk') ? candy.lemon : candy.teal);

/** Static scene. Memoized: targets and the runtime ref are stable between position ticks. */
export const District = memo(function District({ targets, runtime }: { targets: PublicState['interactables']; runtime: React.RefObject<Runtime> }) {
  const still = useReducedMotion();
  return <>
    <color attach="background" args={[candy.peach]} />
    <fog attach="fog" args={['#ffd9c2', 38, 80]} />
    <Sky />
    {/* Toon rim approximation: warm key, cool lavender fill on shadow sides, soft sky/ground bounce. */}
    <ambientLight intensity={.3} />
    <hemisphereLight args={[candy.lavender, candy.peach, .65]} />
    <directionalLight position={[12, 24, 14]} intensity={2.4} color="#fff1dc" />
    <directionalLight position={[-14, 10, -10]} intensity={.55} color={candy.lavender} />
    <Ground />
    <ClearView runtime={runtime}>
    {sceneManifest.colliders.map(({ id, bounds: b }) => <Shape key={id} x={(b.minX + b.maxX) / 2} z={(b.minZ + b.maxZ) / 2} width={b.maxX - b.minX} depth={b.maxZ - b.minZ} height={id.startsWith('platform') ? 1 : 2.4} color={colliderColor(id)} thickness={3} />)}
    {/* Flat slabs mark walkable areas; only frozen colliders are solid. */}
    <Shape x={-10} z={5} width={8} depth={6} height={0.045} color={candy.paving} thickness={1.6} />
    <Shape x={8} z={5} width={6} depth={4} height={0.04} color="#ffe39a" thickness={1.6} />
    <Shape x={0} z={-2.5} width={30} depth={10} height={0.03} color={candy.mint} thickness={1.6} />
    {[-10, 0, 10].map((x) => <group key={x}>
      <Shape x={x} z={-12} width={7} depth={8} height={0.05} color="#a9c9bf" thickness={1.6} />
      <Shape x={x} z={-17.8} width={7} depth={0.4} height={0.07} color={candy.lemon} outline={false} />
      <Shape x={x} z={-18.8} width={7} depth={0.1} height={0.07} color={INK} outline={false} />
    </group>)}
    <Cafe still={still} />
    <Kiosk still={still} />
    <Platforms />
    <LanternString still={still} />
    <Trees still={still} />
    {targets.filter((target) => target.kind === 'npc').map((target, index) => <group key={target.id} position={[target.position.x, 0, target.position.z]} userData={{ clearView: 'solid' }}>
      <Npc id={target.id} index={index} look={runtime} offset={target.position} />
    </group>)}
    {targets.filter((target) => target.kind === 'sign' || target.kind === 'pa').map((target, i) => <Sign key={target.id} target={target} phase={i * 1.9} still={still} />)}
    </ClearView>
    {!still && <><Petals /><Twinkles /></>}
  </>;
});
