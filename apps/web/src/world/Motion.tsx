import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3, Vector2, Raycaster, Plane } from 'three';
import { WORLD_RULES, type Position, type PublicState } from '@vibequest/shared';
import { distance, movePlayer, zoneAt } from './navigation';
import type { CityHandle } from '../city/use-city';
import { Player, type Gait } from './characters';
import { initialPosition, type Runtime } from './runtime';
import { useAudioActivity } from '../audio/audio-bus';
import { DEFAULT_PITCH, orbitDistance } from './camera';

export type Landmark = { label: string; x: number; z: number };

export function Motion({ runtime, root, labels, marks, city, state, tick, sync }: {
  runtime: React.RefObject<Runtime>; root: React.RefObject<HTMLElement | null>;
  labels: React.RefObject<(HTMLSpanElement | null)[]>; marks: readonly Landmark[]; city: CityHandle; state: PublicState;
  tick: (position: Position) => void; sync: (position: Position) => void;
}) {
  const avatar = useRef<Group>(null);
  const gait = useRef<Gait>({ moving: false, speed: 0 });
  const clock = useRef({ ui: 0, frames: 0, elapsed: 0, wasMoving: false });
  const projected = useRef(new Vector3());
  const ray = useRef(new Raycaster());
  const ground = useRef(new Plane(new Vector3(0, 1, 0), 0));
  const activity = useAudioActivity();
  const footsteps = useRef<HTMLAudioElement[]>([]);
  const stride = useRef({ distance: 0, next: 0 });
  useEffect(() => {
    const clips = Array.from({ length: 5 }, (_, i) => {
      const clip = new Audio(`/assets/audio/kenney/impact-sounds/Audio/footstep_concrete_00${i}.ogg`);
      clip.preload = 'auto';
      clip.volume = .25;
      return clip;
    });
    footsteps.current = clips;
    return () => {
      footsteps.current = [];
      for (const clip of clips) { clip.pause(); clip.removeAttribute('src'); clip.load(); }
    };
  }, []);
  useFrame(({ camera, size, gl }, delta) => {
    const r = runtime.current;
    city.focus(r.position);
    // Movement waits until the chunk under the player is committed (server validates the same manifests).
    const blocked = !city.ready(r.position) || !r.active || r.busy || state.status !== 'active' || document.activeElement !== root.current || document.hidden;
    r.groundPoint = (x, y) => {
      const bounds = gl.domElement.getBoundingClientRect();
      ray.current.setFromCamera(new Vector2((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2), camera);
      const point = ray.current.ray.intersectPlane(ground.current, new Vector3());
      return point ? { x: point.x, z: point.z } : null;
    };
    if (blocked) r.path = [];
    const k = r.keys;
    const right = blocked ? 0 : Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const forward = blocked ? 0 : Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    const keyed = Boolean(right || forward);
    if (keyed) r.path = [];
    const waypoint = r.path?.[0];
    const moving = keyed || Boolean(waypoint);
    const previous = r.position;
    if (keyed) r.position = movePlayer(city.view, r.position, right, forward, r.yaw, delta);
    else if (waypoint) {
      const remaining = distance(r.position, waypoint);
      const seconds = Math.min(delta, remaining / WORLD_RULES.movementSpeed);
      r.position = movePlayer(city.view, r.position, waypoint.x - r.position.x, r.position.z - waypoint.z, 0, seconds);
      if (distance(r.position, waypoint) < .01) r.path?.shift();
      else if (distance(previous, r.position) < .0001) r.path = [];
    }
    if (avatar.current) {
      avatar.current.position.set(r.position.x, 0, r.position.z);
      if (distance(previous, r.position) > .0001) avatar.current.rotation.y = Math.atan2(r.position.x - previous.x, r.position.z - previous.z);
    }
    gait.current.moving = moving;
    gait.current.speed = Math.min(distance(previous, r.position) / Math.max(delta, 1e-4), 4.5);
    const traveled = distance(previous, r.position);
    if (blocked || traveled < .0001 || activity === 'recording') {
      stride.current.distance = 0;
      for (const clip of footsteps.current) if (!clip.paused) clip.pause();
    } else {
      stride.current.distance += traveled;
      // Each half-cycle of the avatar's gait is one footfall.
      const stepLength = Math.PI / 3.4;
      if (stride.current.distance >= stepLength && footsteps.current.length) {
        stride.current.distance %= stepLength;
        const clip = footsteps.current[stride.current.next];
        stride.current.next = (stride.current.next + 1) % footsteps.current.length;
        clip.currentTime = 0;
        void clip.play().catch(() => undefined);
      }
    }
    const pitch = r.pitch ?? DEFAULT_PITCH;
    const orbit = orbitDistance(pitch);
    camera.position.set(r.position.x + Math.sin(r.yaw) * orbit * Math.cos(pitch), .7 + orbit * Math.sin(pitch), r.position.z + Math.cos(r.yaw) * orbit * Math.cos(pitch));
    camera.lookAt(r.position.x, .7, r.position.z);
    camera.updateMatrixWorld();
    marks.forEach((mark, i) => {
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
      root.current?.setAttribute('data-zone', zoneAt(city.view, r.position));
    }
    if (c.elapsed >= 2) {
      root.current?.setAttribute('data-fps', (c.frames / c.elapsed).toFixed(1));
      c.elapsed = 0; c.frames = 0;
    }
    const now = performance.now();
    if ((moving && now - r.lastSync >= 300) || (!moving && c.wasMoving)) {
      r.lastSync = now;
      if (distance(r.lastSent ?? initialPosition(state), r.position) > .02 && city.ready(r.position)) sync({ ...r.position });
    }
    c.wasMoving = moving;
  });
  return <group ref={avatar} position={[runtime.current.position.x, 0, runtime.current.position.z]}>
    <Player gait={gait} />
  </group>;
}
