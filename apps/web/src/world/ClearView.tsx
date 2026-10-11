import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Ray, Vector3, type Group, type Material, type Mesh, type Object3D } from 'three';
import type { Runtime } from './runtime';
import { useReducedMotion } from './toon';

const bodySamples = [[0, .5], [0, 1], [0, 1.6], [-.3, 1], [.3, 1]];

/** Nearest explicit marker wins; unmarked assets stay solid by default. */
function fadeGroup(object: Object3D): Object3D | null {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.clearView === 'solid') return null;
    if (node.userData.clearView === 'fade') return node;
  }
  return null;
}

/**
 * Fade only opted-in scenery intersecting the camera's view of the player's body. Marked groups and their
 * bounds are gathered once per `version` (chunk load, LOD step), not every frame; scenery does not move.
 */
export function ClearView({ runtime, version, children }: { runtime: React.RefObject<Runtime>; version: unknown; children: ReactNode }) {
  const group = useRef<Group>(null);
  const entries = useRef(new Map<Object3D, { fade: number; bounds: Box3 }>());
  const gathered = useRef<unknown>(Symbol('never'));
  const meshBounds = useRef(new Box3());
  const originals = useRef(new Map<Material, { opacity: number; transparent: boolean; depthWrite: boolean }>());
  const ray = useRef(new Ray());
  const target = useRef(new Vector3());
  const hit = useRef(new Vector3());
  const still = useReducedMotion();

  useEffect(() => {
    const saved = originals.current;
    return () => {
      for (const [material, original] of saved) {
        Object.assign(material, original);
        delete material.userData.clearViewFade;
        material.needsUpdate = true;
      }
      saved.clear();
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const root = group.current;
    if (!root) return;
    if (gathered.current !== version) {
      gathered.current = version;
      root.updateWorldMatrix(true, true);
      const seen = new Set<Object3D>();
      root.traverse((node) => {
        if (node.userData.clearView !== 'fade') return;
        seen.add(node);
        let entry = entries.current.get(node);
        if (!entry) { entry = { fade: 1, bounds: new Box3() }; entries.current.set(node, entry); }
        // One obstruction decision and animation for the entire marked group.
        // Explicit solid children do not contribute to its obstruction bounds.
        entry.bounds.makeEmpty();
        node.traverse((part) => {
          const mesh = part as Mesh;
          if (!mesh.isMesh || fadeGroup(mesh) !== node) return;
          for (let ancestor = mesh.parent; ancestor && ancestor !== node; ancestor = ancestor.parent) {
            if ((ancestor as Mesh).isMesh) return;
          }
          entry.bounds.union(meshBounds.current.setFromObject(mesh));
        });
      });
      // Unloaded chunks: drop their groups and the material originals that kept their geometry alive.
      for (const [node] of entries.current) {
        if (seen.has(node)) continue;
        node.traverse((part) => { const mesh = part as Mesh; if (mesh.isMesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) originals.current.delete(material); });
        entries.current.delete(node);
      }
    }
    for (const [node, entry] of entries.current) {
      if (entry.bounds.isEmpty() || entry.bounds.max.y < .3) continue;
      const p = runtime.current.position;
      let obstructed = false;
      // Sample head, torso and both sides so thin posts and canopy edges fade too.
      for (const [offset, height] of bodySamples) {
        target.current.set(p.x + offset, height, p.z);
        const length = camera.position.distanceTo(target.current);
        ray.current.set(camera.position, target.current.sub(camera.position).normalize());
        if (entry.bounds.containsPoint(camera.position) ||
          (ray.current.intersectBox(entry.bounds, hit.current) && camera.position.distanceTo(hit.current) < length)) {
          obstructed = true;
          break;
        }
      }
      const opacity = obstructed ? .15 : 1;
      entry.fade = still ? opacity : entry.fade + (opacity - entry.fade) * (1 - Math.exp(-10 * delta));
      if (Math.abs(entry.fade - opacity) < .001) entry.fade = opacity;
      node.traverse((part) => {
        const surface = part as Mesh;
        if (!surface.isMesh || fadeGroup(surface) !== node) return;
        // Keep outline hulls behind their own surface's depth, as before.
        for (let ancestor = surface.parent; ancestor && ancestor !== node; ancestor = ancestor.parent) {
          if ((ancestor as Mesh).isMesh) { surface.renderOrder = ancestor.renderOrder + 1; break; }
        }
        for (const material of Array.isArray(surface.material) ? surface.material : [surface.material]) {
          let original = originals.current.get(material);
          if (!original) {
            original = { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite };
            originals.current.set(material, original);
          }
          const transparent = entry.fade < 1 || original.transparent;
          if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
          material.userData.clearViewFade = entry.fade;
          material.opacity = (material.userData.clearViewOpacity ?? original.opacity) * entry.fade;
          material.depthWrite = original.depthWrite;
        }
      });
    }
  });
  return <group ref={group}>{children}</group>;
}
