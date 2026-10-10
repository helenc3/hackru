import type { AudioControllerProps } from '@vibequest/shared';

/** Segment-005 owns session-linked NPC speech and PA playback. */
export function AudioController({ state }: AudioControllerProps) {
  return (
    <div className="audio-status" data-testid="audio-controller-stub">
      <span aria-hidden="true">♫</span>
      <span>Mandarin speech & PA playback</span>
      <span className="small-label">Unimplemented · Segment-005 · {state.missionId}</span>
    </div>
  );
}
