import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { type Position, type RendererProps } from '@vibequest/shared';
import { distance, nearbyTargets, targetAction, zoneAt } from './navigation';
import { Cue } from './decor';
import { District } from './District';
import { Motion, landmarks } from './Motion';
import { initialPosition, type Runtime } from './runtime';
import './world.css';

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
          // Send the position as of now, not as of queueing: the server clocks arrival, so a
          // stale sample (long frame, slow previous request) shortens the next interval it sees.
          r.pending = null;
          await flushPosition({ ...r.position });
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
