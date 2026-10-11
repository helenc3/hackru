export const PITCH_MIN = .25;
export const PITCH_MAX = 1.35;
/** Default tilt matches the original fixed camera (7.8 up, 9 back). */
export const DEFAULT_PITCH = Math.atan2(7.8, 9);
const DRAG_RADIANS_PER_PIXEL = .006;

/** Standard orbit drag: horizontal motion turns around the player, vertical motion tilts. Dragging down lifts the camera. */
export function dragOrbit(yaw: number, pitch: number, dx: number, dy: number): { yaw: number; pitch: number } {
  return { yaw: yaw - dx * DRAG_RADIANS_PER_PIXEL, pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * DRAG_RADIANS_PER_PIXEL)) };
}

/** The camera closes in as it drops toward the ground: 6 units at the lowest tilt, 15 at the highest. */
export function orbitDistance(pitch: number): number {
  return 6 + 9 * (pitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN);
}
