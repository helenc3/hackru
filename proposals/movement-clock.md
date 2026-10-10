# Compatible internal movement clock correction

The action route synchronizes the mission timer before invoking the engine, so
using that timer as the movement baseline always leaves zero elapsed time.
Session reads and unrelated actions also advance that timer.

Add optional `InternalState.lastMovementAtMs`, initialized by `createGame` and
updated only on accepted movement. Existing internal fixtures remain valid; the
fallback for older states is the existing timer timestamp. Mission retry/start
creates a fresh baseline. Public state and action payloads remain unchanged.
This records the compatible shared schema change needed by the bug fix across
the contract (Segment-000) and engine (Segment-001) seams.
