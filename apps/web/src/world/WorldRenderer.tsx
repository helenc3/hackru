import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { type Position, type RendererProps } from '@vibequest/shared';
import { distance, nearbyTargets, targetAction, zoneAt, walkingPath } from './navigation';
import { DEFAULT_PITCH, dragOrbit } from './camera';
import { Cue } from './decor';
import { District } from './District';
import { DestinationMarker } from './DestinationMarker';
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

function ContextLossHandler({ onFailure }: { onFailure: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const handleLoss = (event: Event) => {
      // R3F deliberately loses the context when disposing a canvas. Only a
      // connected, mounted scene should report a compatibility failure.
      if (!canvas.isConnected) return;
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener('webglcontextlost', handleLoss);
    return () => canvas.removeEventListener('webglcontextlost', handleLoss);
  }, [gl, onFailure]);
  return null;
}

/** Presentation-only world. Every interaction uses the frozen shared callbacks. */
/** `preview` renders the same district behind the welcome screen; it is inert and must not look like the live world to tests or assistive tech. */
export function WorldRenderer({ state, onAction, onTalk, preview = false }: RendererProps & { preview?: boolean }) {
  const [hasWebGl, setHasWebGl] = useState(webGlIsAvailable);
  const [position, setPosition] = useState(() => initialPosition(state));
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const current = useRef({ state, onAction, onTalk });
  current.current = { state, onAction, onTalk };
  const runtime = useRef<Runtime>({ position: initialPosition(state), yaw: 0, keys: new Set(), active: false, busy: false, syncing: false, lastSync: 0, lastSent: null, pending: null, generation: 0 });
  const syncPromise = useRef<Promise<void>>(Promise.resolve());
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean; pointerId: number } | null>(null);
  const sessionKey = `${state.sessionId}:${state.missionId}`;
  useEffect(() => {
    const r = runtime.current;
    r.generation++; r.position = initialPosition(current.current.state); r.lastSent = null; r.pending = null;
    r.keys.clear(); r.path = []; r.busy = false; r.syncing = false; syncPromise.current = Promise.resolve();
    setPosition({ ...r.position }); setBusy(false);
  }, [sessionKey]);
  useEffect(() => {
    const clear = () => { runtime.current.keys.clear(); runtime.current.path = []; runtime.current.active = false; drag.current = null; };
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
      } catch {
        // The session coordinator displays request failures in the recovery popup.
        if (generation === r.generation) r.pending = null;
      } finally { if (generation === r.generation) r.syncing = false; }
    })();
  }

  async function interact(id: string) {
    const r = runtime.current;
    if (r.busy || current.current.state.status !== 'active' || !hasWebGl) return;
    const target = nearbyTargets(current.current.state, r.position).find((item) => item.id === id);
    if (!target) return;
    const generation = r.generation;
    r.busy = true; r.path = []; r.keys.clear(); r.pending = null; setBusy(true);
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
    } catch {
      // The session coordinator displays request failures in the recovery popup.
    } finally { if (generation === r.generation) { r.busy = false; setBusy(false); } }
  }

  const nearby = nearbyTargets(state, position);
  const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  return <section ref={root} tabIndex={0} className="world-renderer district-world" aria-label="Mandarin district — keyboard or click to move" data-testid={preview ? 'world-preview' : 'world-renderer'}
    onFocus={(event) => { runtime.current.active = event.target === root.current; }}
    onBlur={() => { runtime.current.keys.clear(); runtime.current.path = []; runtime.current.active = false; }}
    onKeyDown={(event) => {
      if (event.target !== root.current || event.nativeEvent.isComposing) return;
      if (movementKeys.includes(event.code)) { event.preventDefault(); runtime.current.keys.add(event.code); runtime.current.path = []; }
      if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); const target = nearbyTargets(current.current.state, runtime.current.position)[0]; if (target) void interact(target.id); }
    }}
    onKeyUp={(event) => { runtime.current.keys.delete(event.code); }}
    onPointerDown={(event) => {
      if (event.target instanceof HTMLCanvasElement && (event.button === 0 || event.button === 2)) {
        root.current?.focus();
        drag.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }}
    onContextMenu={(event) => { if (event.target instanceof HTMLCanvasElement) event.preventDefault(); }}
    onPointerMove={(event) => {
      const gesture = drag.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 5) return;
      gesture.moved = true;
      const r = runtime.current;
      const next = dragOrbit(r.yaw, r.pitch ?? DEFAULT_PITCH, event.clientX - gesture.x, event.clientY - gesture.y);
      r.yaw = next.yaw; r.pitch = next.pitch;
      gesture.x = event.clientX; gesture.y = event.clientY;
    }}
    onPointerUp={(event) => {
      const gesture = drag.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (!gesture.moved && !runtime.current.busy && current.current.state.status === 'active') {
        const point = runtime.current.groundPoint?.(event.clientX, event.clientY);
        if (point) { runtime.current.keys.clear(); runtime.current.path = walkingPath(runtime.current.position, point); }
      }
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; }}>
    {hasWebGl ? <CanvasBoundary onFailure={() => { runtime.current.keys.clear(); runtime.current.path = []; runtime.current.active = false; setHasWebGl(false); }}><Canvas dpr={[1, 1.5]} camera={{ position: [0, 8.5, 19], fov: 52, near: .1, far: 85 }} gl={{ antialias: true, powerPreference: 'high-performance' }}
      fallback={<CompatibilityRecovery />}>
      <ContextLossHandler onFailure={() => { runtime.current.keys.clear(); runtime.current.path = []; runtime.current.active = false; setHasWebGl(false); }} />
      <District targets={state.interactables} runtime={runtime} /><Cue at={nearby[0]?.position} /><Motion runtime={runtime} root={root} labels={labels} state={state} tick={setPosition} sync={sync} /><DestinationMarker runtime={runtime} />
    </Canvas></CanvasBoundary> : <CompatibilityRecovery />}
    {hasWebGl && <>
      <div className="district-labels" aria-hidden="true">{landmarks.map((mark, i) => <span key={mark.label} ref={(node) => { labels.current[i] = node; }} className="district-landmark" lang="zh-Hans">{mark.label}</span>)}</div>
      <div className="world-caption"><span className="live-dot" />The district<span>Third-person navigation</span></div>
      <div className="district-nearby" aria-label="Nearby interactions">{nearby.map((target, i) => <button key={target.id} disabled={busy || state.status !== 'active'} onClick={() => void interact(target.id)} data-target-id={target.id}><span lang="zh-Hans">{target.label}</span>{i === 0 ? ' · E' : ''}</button>)}</div>
      <div className="world-note">WASD / arrows or click to walk · Drag sideways to orbit, up / down to tilt · E to interact</div>
    </>}
  </section>;
}
