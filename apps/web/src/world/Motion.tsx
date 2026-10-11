import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3, Vector2, Raycaster, Plane } from 'three';
import { sceneManifest, type Position, type PublicState } from '@vibequest/shared';
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
  const ray = useRef(new Raycaster());
  const ground = useRef(new Plane(new Vector3(0, 1, 0), 0));
  useFrame(({ camera, size, gl }, delta) => {
    const r = runtime.current;
    const blocked = !r.active || r.busy || state.status !== 'active' || document.activeElement !== root.current || document.hidden;
    r.groundPoint = (x, y) => {
      const bounds = gl.domElement.getBoundingClientRect();
      ray.current.setFromCamera(new Vector2((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2), camera);
      const point = ray.current.ray.intersectPlane(ground.current, new Vector3());
      return point ? { x: point.x, z: point.z } : null;
    };
    if (blocked) r.path = [];
    const waypoint = r.path?.[0];
    const moving = Boolean(waypoint);
    const previous = r.position;
    if (waypoint) {
      const remaining = distance(r.position, waypoint);
      const seconds = Math.min(delta, remaining / sceneManifest.movementSpeed);
      r.position = movePlayer(r.position, waypoint.x - r.position.x, r.position.z - waypoint.z, 0, seconds);
      if (distance(r.position, waypoint) < .01) r.path?.shift();
      else if (distance(previous, r.position) < .0001) r.path = [];
    }
    if (avatar.current) {
      avatar.current.position.set(r.position.x, 0, r.position.z);
      if (distance(previous, r.position) > .0001) avatar.current.rotation.y = Math.atan2(r.position.x - previous.x, r.position.z - previous.z);
    }
    gait.current.moving = moving;
    gait.current.speed = Math.min(distance(previous, r.position) / Math.max(delta, 1e-4), 4.5);
    const pitch = r.pitch ?? Math.atan2(7.8, 9);
    const orbit = Math.hypot(7.8, 9);
    camera.position.set(r.position.x + Math.sin(r.yaw) * orbit * Math.cos(pitch), .7 + orbit * Math.sin(pitch), r.position.z + Math.cos(r.yaw) * orbit * Math.cos(pitch));
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
