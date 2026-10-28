import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3, PerspectiveCamera } from 'three';
import { WORLD_RULES, type Position, type PublicState } from '@vibequest/shared';
import { distance, movePlayer, zoneAt } from './navigation';
import type { CityHandle } from '../city/use-city';
import { Player, type Gait } from './characters';
import { initialPosition, type Runtime } from './runtime';
import { useAudioActivity } from '../audio/audio-bus';
import { testProfile } from './test-profile';
import { buildingCameraVolumes, cameraDistance, CAMERA_HEIGHT, DEFAULT_PITCH, orbitDistance, SHOULDER_OFFSET } from './camera';

export type Landmark = { id?: string; label: string; x: number; z: number };

export function Motion({ runtime, root, labels, marks, city, state, tick, sync, conversationOpen = false, still = false }: {
  runtime: React.RefObject<Runtime>; root: React.RefObject<HTMLElement | null>;
  labels: React.RefObject<(HTMLSpanElement | null)[]>; marks: readonly Landmark[]; city: CityHandle; state: PublicState;
  conversationOpen?: boolean; still?: boolean;
  tick: (position: Position) => void; sync: (position: Position) => void;
}) {
  const avatar = useRef<Group>(null);
  const gait = useRef<Gait>({ moving: false, speed: 0 });
  const clock = useRef({ ui: 0, frames: 0, elapsed: 0, wasMoving: false });
  const projected = useRef(new Vector3());
  const framing = useRef(0);
  const boom = useRef({ origin: new Vector3(), desired: new Vector3(), target: new Vector3() });
  const cameraObstacles = [...city.manifests.values()].map(buildingCameraVolumes);
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
  useFrame(({ camera, size }, delta) => {
    const r = runtime.current;
    const profile = testProfile();
    const multiplier = state.providerStatus === 'fixture' ? profile.movementMultiplier : 1;
    city.focus(r.position);
    // Movement waits until the chunk under the player is committed (server validates the same manifests).
    const ownsMouse = document.pointerLockElement === root.current;
    const blocked = conversationOpen || !city.ready(r.position) || (!r.active && !ownsMouse) || r.busy || state.status !== 'active' || (!ownsMouse && document.activeElement !== root.current) || document.hidden;
    if (conversationOpen) { r.keys.clear(); r.goal = undefined; }
    if (blocked) r.path = [];
    const k = r.keys;
    const right = blocked ? 0 : Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const forward = blocked ? 0 : Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    const keyed = Boolean(right || forward);
    if (keyed) { r.path = []; r.goal = undefined; }
    // A far goal re-plans one leg at a time, so it keeps going as chunks ahead stream in.
    if (!blocked && !keyed && !r.path?.length && r.goal) {
      if (distance(r.position, r.goal) < 1) r.goal = undefined;
      else if (performance.now() >= (r.replanAt ?? 0)) { r.path = r.leg?.(r.position, r.goal) ?? []; r.replanAt = performance.now() + 400 / multiplier; }
    }
    const waypoint = r.path?.[0];
    const moving = keyed || Boolean(waypoint);
    const previous = r.position;
    if (keyed) r.position = movePlayer(city.view, r.position, right, forward, r.yaw, delta, multiplier);
    else if (waypoint) {
      const remaining = distance(r.position, waypoint);
      const seconds = Math.min(delta, remaining / (WORLD_RULES.movementSpeed * multiplier));
      r.position = movePlayer(city.view, r.position, waypoint.x - r.position.x, r.position.z - waypoint.z, 0, seconds, multiplier);
      if (distance(r.position, waypoint) < .01) r.path?.shift();
      else if (distance(previous, r.position) < .0001) r.path = [];
    }
    if (avatar.current) {
      avatar.current.position.set(r.position.x, 0, r.position.z);
      // The avatar always faces away from the camera, including when strafing/backing up.
      avatar.current.rotation.y = r.yaw + Math.PI;
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
    const b = boom.current;
    b.origin.set(r.position.x, CAMERA_HEIGHT, r.position.z);
    b.target.set(r.position.x + Math.cos(r.yaw) * SHOULDER_OFFSET, CAMERA_HEIGHT, r.position.z - Math.sin(r.yaw) * SHOULDER_OFFSET);
    b.desired.set(b.target.x + Math.sin(r.yaw) * orbit * Math.cos(pitch), CAMERA_HEIGHT + orbit * Math.sin(pitch), b.target.z + Math.cos(r.yaw) * orbit * Math.cos(pitch));
    const allowed = cameraDistance(b.origin, b.desired, cameraObstacles);
    camera.position.copy(b.desired).sub(b.origin).setLength(allowed).add(b.origin);
    // Keep the viewing direction steady when the boom compresses against a wall.
    b.target.sub(b.desired).add(camera.position);
    camera.lookAt(b.target);
    if (avatar.current) avatar.current.visible = allowed > .65;
    // Shift the optical center without resizing the world or changing the orbit.
    // A 20% view offset places the player at 30% of the full viewport width.
    const targetFraming = conversationOpen ? .2 : 0;
    framing.current = still ? targetFraming : framing.current + (targetFraming - framing.current) * (1 - Math.exp(-10 * delta));
    if (Math.abs(framing.current - targetFraming) < .0001) framing.current = targetFraming;
    root.current?.style.setProperty('--conversation-offset', `${framing.current * 100}%`);
    if (camera instanceof PerspectiveCamera) {
      if (framing.current === 0) camera.clearViewOffset();
      else camera.setViewOffset(size.width, size.height, size.width * framing.current, 0, size.width, size.height);
    }
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
    root.current?.setAttribute('data-camera-yaw', r.yaw.toFixed(3));
    root.current?.setAttribute('data-avatar-yaw', (r.yaw + Math.PI).toFixed(3));
    root.current?.setAttribute('data-camera-distance', allowed.toFixed(3));
    if (c.ui >= .1) {
      c.ui = 0;
      tick({ ...r.position });
      root.current?.setAttribute('data-zone', zoneAt(city.view, r.position));
    }
    if (c.elapsed >= profile.fpsSampleSeconds) {
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
