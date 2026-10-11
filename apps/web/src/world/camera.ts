/** Pointer angle around the canvas center; the center itself has no angle. */
export function pointerAngle(x: number, y: number, bounds: { left: number; top: number; width: number; height: number }): number | null {
  const dx = x - (bounds.left + bounds.width / 2);
  const dy = y - (bounds.top + bounds.height / 2);
  return Math.hypot(dx, dy) < 8 ? null : Math.atan2(dy, dx);
}

/** Shortest signed turn, including when crossing the atan2 ±π boundary. */
export function angularDisplacement(previous: number, next: number): number {
  return Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
}
