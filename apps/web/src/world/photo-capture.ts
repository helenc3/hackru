import type { Position } from '@vibequest/shared';

export type PhotoResult = { digest: string; dataUrl: string };
type CaptureFn = (spot: Position, viewpoint: Position) => Promise<PhotoResult>;

// The mounted world canvas registers its capture function; the photo UI calls capturePhoto.
let current: CaptureFn | null = null;
export function registerCapture(fn: CaptureFn | null): void { current = fn; }

/**
 * Renders one in-game frame of the player at `spot` with the river behind them (no device camera)
 * and returns a JPEG data URL plus its SHA-256 hex digest for the server acknowledgment.
 * Rejects when no world canvas is mounted (e.g. WebGL recovery) so the quest can retry.
 */
export function capturePhoto(spot: Position, viewpoint: Position): Promise<PhotoResult> {
  return current ? current(spot, viewpoint) : Promise.reject(new Error('The world view is unavailable for a photo.'));
}

export async function digestHex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
