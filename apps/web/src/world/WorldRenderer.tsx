import { Component, memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { sceneManifest, type Position, type PublicState, type RendererProps } from '@vibequest/shared';
import { distance, movePlayer, nearbyTargets, targetAction, zoneAt } from './navigation';
import { candy, INK, Toon, useReducedMotion } from './toon';
import { Player, Npc, type Gait } from './characters';
import { Cafe, Cue, Ground, Kiosk, LanternString, Petals, Platforms, Sign, Sky, Trees, Twinkles } from './decor';
import './world.css';

const landmarks = [
  { label: '广场', x: 0, z: 11 }, { label: '咖啡店', x: -10, z: 7.8 },
  { label: '售货亭', x: 8, z: 7 }, { label: '车站', x: 0, z: 1 },
  ...[-10, 0, 10].map((x, i) => ({ label: ['一号站台', '二号站台', '三号站台'][i], x, z: -13.8 })),
];

function webGlIsAvailable(): boolean {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

function CompatibilityRecovery() {
  return <div className="compatibility-screen" data-testid="webgl-recovery" role="status">
    <span className="compatibility-icon" aria-hidden="true">◇</span>
    <h3>The district needs WebGL</h3>
    <p>Enable hardware acceleration in a current desktop browser, then reload. Your session stays in the app.</p>
    <button className="button secondary" onClick={() => window.location.reload()}>Reload preview</button>
    <small>Compatibility recovery does not start a game or advance a mission.</small>
  </div>;
}

class CanvasBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <CompatibilityRecovery /> : this.props.children; }
}

type Runtime = {
  position: Position; yaw: number; keys: Set<string>; active: boolean;
  busy: boolean; syncing: boolean; lastSync: number; lastSent: Position | null;
  pending: Position | null; generation: number;
};

function initialPosition(state: PublicState): Position {
  return { ...(state.zoneId === 'plaza' ? sceneManifest.spawn : sceneManifest.zones.find((zone) => zone.id === state.zoneId)?.center ?? sceneManifest.spawn) };
}

function Shape({ x, z, width, depth, height, color, outline = true, thickness }: { x: number; z: number; width: number; depth: number; height: number; color: string; outline?: boolean; thickness?: number }) {
  return <mesh position={[x, height / 2, z]}><boxGeometry args={[width, height, depth]} /><Toon color={color} outline={outline} thickness={thickness} /></mesh>;
}

const colliderColor = (id: string) => (id.startsWith('cafe') ? candy.coral : id.startsWith('kiosk') ? candy.lemon : candy.teal);

/** Static scene. Memoized: targets and the runtime ref are stable between position ticks. */
const District = memo(function District({ targets, runtime }: { targets: PublicState['interactables']; runtime: React.RefObject<Runtime> }) {
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
    <Cafe player={runtime} still={still} />
    <Kiosk player={runtime} still={still} />
    <Platforms player={runtime} />
    <LanternString still={still} />
    <Trees still={still} />
    {targets.filter((target) => target.kind === 'npc').map((target, index) => <group key={target.id} position={[target.position.x, 0, target.position.z]}>
      <Npc id={target.id} index={index} look={runtime} offset={target.position} />
    </group>)}
    {targets.filter((target) => target.kind === 'sign' || target.kind === 'pa').map((target, i) => <Sign key={target.id} target={target} phase={i * 1.9} still={still} />)}
    {!still && <><Petals /><Twinkles /></>}
  </>;
});

function Motion({ runtime, root, labels, state, tick, sync }: {
  runtime: React.RefObject<Runtime>; root: React.RefObject<HTMLElement | null>;
  labels: React.RefObject<(HTMLSpanElement | null)[]>; state: PublicState;
  tick: (position: Position) => void; sync: (position: Position) => void;
}) {
  const avatar = useRef<Group>(null);
  const gait = useRef<Gait>({ moving: false, speed: 0 });
  const clock = useRef({ ui: 0, frames: 0, elapsed: 0, wasMoving: false });
  const projected = useRef(new Vector3());
  useFrame(({ camera, size }, delta) => {
    const r = runtime.current;
    const k = r.keys;
    const blocked = !r.active || r.busy || state.status !== 'active' || document.activeElement !== root.current || document.hidden;
    const right = blocked ? 0 : Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const forward = blocked ? 0 : Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    const moving = Boolean(right || forward);
    const previous = r.position;
    r.position = movePlayer(r.position, right, forward, r.yaw, delta);
    if (avatar.current) {
      avatar.current.position.set(r.position.x, 0, r.position.z);
      if (distance(previous, r.position) > .0001) avatar.current.rotation.y = Math.atan2(r.position.x - previous.x, r.position.z - previous.z);
    }
    gait.current.moving = moving;
    gait.current.speed = Math.min(distance(previous, r.position) / Math.max(delta, 1e-4), 4.5);
    // Fixed elevated pitch keeps the capsule visible; yaw is the only orbit axis.
    camera.position.set(r.position.x + Math.sin(r.yaw) * 9, 8.5, r.position.z + Math.cos(r.yaw) * 9);
    camera.lookAt(r.position.x, .7, r.position.z);
    camera.updateMatrixWorld();
    landmarks.forEach((mark, i) => {
      const node = labels.current[i];
      if (!node) return;
      const p = projected.current.set(mark.x, 1.9, mark.z).project(camera);
      node.style.display = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 ? 'block' : 'none';
      node.style.transform = `translate(${(p.x + 1) * size.width / 2}px, ${(-p.y + 1) * size.height / 2}px) translate(-50%, -100%)`;
    });
    const c = clock.current;
    c.ui += delta; c.elapsed += delta; c.frames++;
    root.current?.setAttribute('data-position-x', r.position.x.toFixed(3));
    root.current?.setAttribute('data-position-z', r.position.z.toFixed(3));
    if (c.ui >= .1) {
      c.ui = 0;
      tick({ ...r.position });
      root.current?.setAttribute('data-zone', zoneAt(r.position));
    }
    if (c.elapsed >= 2) {
      root.current?.setAttribute('data-fps', (c.frames / c.elapsed).toFixed(1));
      c.elapsed = 0; c.frames = 0;
    }
    const now = performance.now();
    if ((moving && now - r.lastSync >= 300) || (!moving && c.wasMoving)) {
      r.lastSync = now;
      if (distance(r.lastSent ?? initialPosition(state), r.position) > .02) sync({ ...r.position });
    }
    c.wasMoving = moving;
  });
  return <group ref={avatar} position={[runtime.current.position.x, 0, runtime.current.position.z]}>
    <Player gait={gait} />
  </group>;
}

/** Presentation-only world. Every interaction uses the frozen shared callbacks. */
export function WorldRenderer({ state, onAction, onTalk }: RendererProps) {
  const [hasWebGl, setHasWebGl] = useState(webGlIsAvailable);
  const [position, setPosition] = useState(() => initialPosition(state));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const current = useRef({ state, onAction, onTalk });
  current.current = { state, onAction, onTalk };
  const runtime = useRef<Runtime>({ position: initialPosition(state), yaw: 0, keys: new Set(), active: false, busy: false, syncing: false, lastSync: 0, lastSent: null, pending: null, generation: 0 });
  const syncPromise = useRef<Promise<void>>(Promise.resolve());
  const drag = useRef<{ x: number; pointerId: number } | null>(null);
  const sessionKey = `${state.sessionId}:${state.missionId}`;
  useEffect(() => {
    const r = runtime.current;
    r.generation++; r.position = initialPosition(current.current.state); r.lastSent = null; r.pending = null;
    r.keys.clear(); r.busy = false; r.syncing = false; syncPromise.current = Promise.resolve();
    setPosition({ ...r.position }); setBusy(false); setError('');
  }, [sessionKey]);
  useEffect(() => {
    const clear = () => { runtime.current.keys.clear(); runtime.current.active = false; drag.current = null; };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => { clear(); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); runtime.current.generation++; };
  }, []);

  async function flushPosition(next: Position) {
    const r = runtime.current;
    const generation = r.generation;
    if (r.lastSent && distance(r.lastSent, next) < .02) return;
    await current.current.onAction({ type: 'moveZone', zoneId: zoneAt(next), position: next });
    if (generation === r.generation) r.lastSent = { ...next };
  }

  function sync(next: Position) {
    const r = runtime.current;
    r.pending = next;
    if (r.busy || r.syncing) return;
    const generation = r.generation;
    r.syncing = true;
    syncPromise.current = (async () => {
      try {
        while (r.pending && generation === r.generation) {
          const value = r.pending; r.pending = null;
          await flushPosition(value);
        }
      } catch (cause) {
        if (generation === r.generation) { r.pending = null; setError(cause instanceof Error ? cause.message : 'Position could not sync. Try again.'); }
      } finally { if (generation === r.generation) r.syncing = false; }
    })();
  }

  async function interact(id: string) {
    const r = runtime.current;
    if (r.busy || current.current.state.status !== 'active' || !hasWebGl) return;
    const target = nearbyTargets(current.current.state, r.position).find((item) => item.id === id);
    if (!target) return;
    const generation = r.generation;
    r.busy = true; r.keys.clear(); r.pending = null; setBusy(true); setError('');
    try {
      await syncPromise.current;
      if (generation !== r.generation) return;
      await flushPosition({ ...r.position });
      if (generation !== r.generation) return;
      if (target.kind === 'npc') current.current.onTalk(target.id);
      else {
        const action = targetAction(target);
        if (action) await current.current.onAction(action);
        if (generation !== r.generation) return;
      }
    } catch (cause) {
      if (generation === r.generation) setError(cause instanceof Error ? cause.message : 'Interaction failed. Try again.');
    } finally { if (generation === r.generation) { r.busy = false; setBusy(false); } }
  }

  const nearby = nearbyTargets(state, position);
  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  return <section ref={root} tabIndex={0} className="world-renderer district-world" aria-label="Mandarin district — keyboard navigation" data-testid="world-renderer"
    onFocus={(event) => { runtime.current.active = event.target === root.current; }}
    onBlur={() => { runtime.current.keys.clear(); runtime.current.active = false; }}
    onKeyDown={(event) => {
      if (event.target !== root.current || event.nativeEvent.isComposing) return;
      if (movementKeys.includes(event.code)) { event.preventDefault(); runtime.current.keys.add(event.code); }
      if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); const target = nearbyTargets(current.current.state, runtime.current.position)[0]; if (target) void interact(target.id); }
    }}
    onKeyUp={(event) => { runtime.current.keys.delete(event.code); }}
    onPointerDown={(event) => {
      if (event.target instanceof HTMLCanvasElement && event.button === 0) {
        root.current?.focus(); drag.current = { x: event.clientX, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId);
      }
    }}
    onPointerMove={(event) => { if (drag.current) { runtime.current.yaw -= (event.clientX - drag.current.x) * .006; drag.current.x = event.clientX; } }}
    onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { drag.current = null; }}>
    {hasWebGl ? <CanvasBoundary onFailure={() => { runtime.current.keys.clear(); runtime.current.active = false; setHasWebGl(false); }}><Canvas dpr={[1, 1.5]} camera={{ position: [0, 8.5, 19], fov: 52, near: .1, far: 85 }} gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', (event) => { event.preventDefault(); runtime.current.keys.clear(); runtime.current.active = false; setHasWebGl(false); }, { once: true }); }} fallback={<CompatibilityRecovery />}>
      <District targets={state.interactables} runtime={runtime} /><Cue at={nearby[0]?.position} /><Motion runtime={runtime} root={root} labels={labels} state={state} tick={setPosition} sync={sync} />
    </Canvas></CanvasBoundary> : <CompatibilityRecovery />}
    {hasWebGl && <>
      <div className="district-labels" aria-hidden="true">{landmarks.map((mark, i) => <span key={mark.label} ref={(node) => { labels.current[i] = node; }} className="district-landmark" lang="zh-Hans">{mark.label}</span>)}</div>
      <div className="world-caption"><span className="live-dot" />The district<span>Third-person navigation</span></div>
      <div className="district-nearby" aria-label="Nearby interactions">{nearby.map((target, i) => <button key={target.id} disabled={busy || state.status !== 'active'} onClick={() => void interact(target.id)} data-target-id={target.id}><span lang="zh-Hans">{target.label}</span>{i === 0 ? ' · E' : ''}</button>)}</div>
      <div className="world-note">Click the district · WASD / arrows to walk · Drag to turn · E to interact</div>
      {error && <div className="district-error" role="alert">{error}<button onClick={() => { setError(''); root.current?.focus(); }}>Dismiss</button></div>}
    </>}
  </section>;
}
