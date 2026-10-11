import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import type { Position, PublicState } from '@vibequest/shared';
import { distance, movePlayer, zoneAt } from './navigation';
import { Player, type Gait } from './characters';
import { initialPosition, type Runtime } from './runtime';

export const landmarks = [
  { label: '广场', x: 0, z: 11 }, { label: '咖啡店', x: -10, z: 7.8 },
  { label: '售货亭', x: 8, z: 7 }, { label: '车站', x: 0, z: 1 },
  ...[-10, 0, 10].map((x, i) => ({ label: ['一号站台', '二号站台', '三号站台'][i], x, z: -13.8 })),
];

export function Motion({ runtime, root, labels, state, tick, sync }: {
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
