import { useSyncExternalStore } from 'react';
import { ApiErrorSchema, TranscriptionResponseSchema, type TranscriptionResponse } from '@vibequest/shared';

/** One local audio lane: the recorder and the player never overlap. */
export type AudioActivity = 'idle' | 'recording' | 'playing';
let activity: AudioActivity = 'idle';
const listeners = new Set<() => void>();
export function setAudioActivity(next: AudioActivity): void {
  if (activity === next) return;
  activity = next;
  for (const listener of listeners) listener();
}
export function useAudioActivity(): AudioActivity {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => activity);
}

/**
 * Pending transcript confirmation. The dialogue panel calls this before Send so the
 * server's confirmation pause ends; the turn route rejects submissions during an operation.
 */
let confirmation: (() => Promise<void>) | null = null;
export function setConfirmation(finish: (() => Promise<void>) | null): void { confirmation = finish; }
export async function finishConfirmation(): Promise<void> {
  const finish = confirmation; confirmation = null;
  await finish?.();
}

export class AudioApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryable: boolean) { super(message); this.name = 'AudioApiError'; }
}
async function failure(response: Response): Promise<AudioApiError> {
  const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success
    ? new AudioApiError(response.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.retryable)
    : new AudioApiError(response.status, 'HTTP_ERROR', 'The audio service could not complete this request.', response.status >= 500);
}

export async function uploadClip(sessionId: string, clip: Blob, operationId: string, signal?: AbortSignal): Promise<TranscriptionResponse> {
  const form = new FormData();
  form.append('audio', clip, `clip.${clip.type.includes('ogg') ? 'ogg' : clip.type.includes('mp4') ? 'm4a' : 'webm'}`);
  form.append('operationId', operationId);
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/transcriptions`, { method: 'POST', body: form, signal });
  if (!response.ok) throw await failure(response);
  return TranscriptionResponseSchema.parse(await response.json());
}

/** Polls a server speech job: 202 + Retry-After while pending, audio when ready, 410 when gone. */
export async function fetchSpeech(sessionId: string, speechId: string, signal: AbortSignal, maxTries = 12): Promise<Blob> {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/speech/${encodeURIComponent(speechId)}`, { signal });
    if (response.status === 200) return response.blob();
    if (response.status !== 202) throw await failure(response);
    const wait = Math.min(5, Math.max(0.25, Number(response.headers.get('Retry-After')) || 1)) * 1000;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, wait);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  }
  throw new AudioApiError(504, 'SPEECH_TIMEOUT', 'The reply audio took too long. Retry playback or read the reply.', true);
}

/** The server's active audio-channel PA playback for this attempt, if any. */
export type CuePlayback = { playbackId: string; cueId: string; audioAssetId: string; finishAfterMs: number };
export async function fetchCuePlayback(sessionId: string, signal?: AbortSignal): Promise<CuePlayback | null> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/cue-playback`, { signal });
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as { playback: CuePlayback | null }).playback;
}
