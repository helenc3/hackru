import type { RecorderProps } from '@vibequest/shared';

/** Segment-005 owns microphone capture, transcription, and confirmation here. */
export function Recorder({ state }: RecorderProps) {
  return (
    <div className="voice-control" data-testid="recorder-stub">
      <span className="mic-symbol" aria-hidden="true">◉</span>
      <div>
        <strong>Your voice, your adventure</strong>
        <p>Microphone → Mandarin transcription → NPC reply</p>
      </div>
      <button disabled aria-describedby="recorder-status">Start recording</button>
      <p id="recorder-status" className="unimplemented-note">
        Unimplemented · Segment-005 · Input preference: {state.inputPreference}
      </p>
    </div>
  );
}
