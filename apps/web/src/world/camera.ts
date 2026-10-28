import { Box3, Ray, Vector3 } from 'three';
import { catalogEntry, chunkOrigin, resolveParams, rotateRect, type ChunkManifest } from '@vibequest/shared';

export const PITCH_MIN = -.15;
export const PITCH_MAX = .65;
export const DEFAULT_PITCH = .2;
export const SHOULDER_DISTANCE = 3.8;
export const SHOULDER_OFFSET = .45;
export const CAMERA_HEIGHT = 1.25;
const CAMERA_CLEARANCE = .22;
const DRAG_RADIANS_PER_PIXEL = .006;

/** Standard orbit drag: horizontal motion turns around the player, vertical motion tilts. Dragging down lifts the camera. */
export function dragOrbit(yaw: number, pitch: number, dx: number, dy: number): { yaw: number; pitch: number } {
  return { yaw: yaw - dx * DRAG_RADIANS_PER_PIXEL, pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * DRAG_RADIANS_PER_PIXEL)) };
}

/** Stable shoulder distance: looking up/down never zooms out to a bird's-eye view. */
export function orbitDistance(_pitch: number): number {
  return SHOULDER_DISTANCE;
}

/** Building volumes come from the same catalog dimensions as their solid rendered shells.
 * Cache per immutable manifest, independently of visual batching, hidden meshes, and LOD.
 */
const volumes = new WeakMap<ChunkManifest, readonly Box3[]>();
export function buildingCameraVolumes(manifest: ChunkManifest): readonly Box3[] {
  const cached = volumes.get(manifest);
  if (cached) return cached;
  const origin = chunkOrigin(manifest.coord);
  const boxes: Box3[] = [];
  for (const placement of manifest.placements) {
    const entry = catalogEntry(placement.assetId);
    if (!entry || (entry.category !== 'building' && !entry.capabilities.includes('hotel-landmark')) || placement.attachTo) continue;
    const params = resolveParams(entry, placement.params);
    const size = entry.footprint(params);
    // Preserve walkable archways/courtyards instead of treating the entire footprint as solid.
    for (const solid of entry.collision(params).solids) {
      const bounds = rotateRect(solid, placement.rotation);
      boxes.push(new Box3(
        new Vector3(origin.x + placement.x + bounds.minX, 0, origin.z + placement.z + bounds.minZ),
        new Vector3(origin.x + placement.x + bounds.maxX, size.h + .25, origin.z + placement.z + bounds.maxZ),
      ).expandByScalar(CAMERA_CLEARANCE));
    }
  }
  volumes.set(manifest, boxes);
  return boxes;
}

/** Sweep the camera boom from the avatar to the desired shoulder position. Pull in
 * immediately at a wall; never interpolate through it or rely on one-sided mesh rays.
 */
export function cameraDistance(origin: Vector3, desired: Vector3, obstacles: Iterable<readonly Box3[]>): number {
  const length = origin.distanceTo(desired);
  if (!length) return 0;
  const ray = new Ray(origin, desired.clone().sub(origin).divideScalar(length));
  const hit = new Vector3();
  let allowed = length;
  for (const boxes of obstacles) for (const box of boxes) {
    if (box.containsPoint(origin)) return 0;
    if (ray.intersectBox(box, hit)) allowed = Math.min(allowed, Math.max(0, origin.distanceTo(hit) - .02));
  }
  return allowed;
}
