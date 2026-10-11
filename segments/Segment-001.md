# Segment-001: Authoritative engine, authored missions, and session API

Spec version 1.2 · Suggested owner A · Invocation: **Build Segment-001**

## Context available to a fresh account

Speak Your Way is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 3, 4, 5, 7, 11, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-000](Segment-000.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `packages/shared/src/engine/** (except skills.ts)`
- `packages/shared/src/content/** (except scene-manifest.ts)`
- `apps/server/src/routes/game.ts`
- `apps/server/src/session-store.ts`
- `apps/server/tests/game/**`
- `packages/shared/tests/engine/**`
- `fixtures/engine/**`
- `.build/claims/Segment-001.json`, `.build/completed/Segment-001.json`, `.build/proposals/Segment-001.md`

All other paths are read-only for this segment unless the human explicitly expands scope. Normal ownership exceptions are coordinated through the protocol, not copied private types.

## Build steps

1. Implement pure engine transitions and all P1/P2/B1 graph data, fixed facts, explicit payment/boarding choices, alternate branches, and retry paths. In P1 require receipt plus spoken-direction cue and station arrival; in P2 require timetable plus NPC direction exchange plus PA before boarding. Voice source metadata is authoritative, not client asserted. Use canonical IDs and schemas from 000.
2. Implement NPC patience/mood, inventory, nonfarmable mission rewards, active clock and bounded pause reasons, freeze duration, boss gates, evidence modality, and debrief storage. Keep skill updates behind the established extension point for 006.
3. Build session/action/turn routes with serialized state mutations, version checks, completed/in-flight idempotency, attempt IDs, and late-response rejection. Invoke injected DialogueProvider; default to fixtures before 002 is merged.
4. Project public state so active boss contains no English meanings, secret route solution, coach or evaluator score. Reject hint/freeze/coach actions server-side.
5. Validate graph references and terminal reachability. Author critical Mandarin reply templates for directions/prices and grounded clarification.

## Implementation clarifications

### P1 price confirmation

Spoken price confirmation is a real semantic prerequisite for both café and kiosk payment. An available drink selection alone does not enable payment. The player must confirm the selected drink and its authored price: tea ¥10 or water ¥5. Typed accessibility and internal validation can satisfy the same semantic prerequisite, with their evidence sources labeled honestly. Cancelling clears both selection and confirmation; the kiosk branch requires a fresh selection and confirmation.

The current frozen evaluation cannot represent this prerequisite. Before implementing it, record an additive contract proposal in `.build/proposals/Segment-001.md` for intent `confirm_drink_price` with slots `drink=tea|water` and `priceCny` (an integer from 0 to 1000). Both slots are required for confirmation; the engine checks the pair against authored facts. Normalize spoken/written Mandarin numerals in the provider, preserve a wrong recognized price for engine correction, and never derive confirmation from the model's reply text or a generic intent score. Missing/wrong details elicit grounded clarification and leave payment disabled. Out-of-range or unrecognized prices require clarification rather than guessing an allowed value.

Shared schemas, intent allowlists, and provider fixtures must be updated through their owners before this gate is integrated. This packet does not authorize edits to `contracts.ts` or Segment-002 paths. Continue independent engine work while coordinating the proposal; do not replace the gate with a private type or silently weaken it to selection alone.

### Session records shared with Segment-005

Segment-001 owns the session record interface and atomic storage operations in `session-store.ts`; Segment-005 consumes that interface through the injected session store. Keep ephemeral transcription and speech-job registries on `SessionRecord`, separate from projected game state. Use the existing shared `TranscriptionRecord` schema. Agree on and document exported registration/lookup operations before audio integration; do not let either segment maintain a second session registry.

Transcription registration captures session ID, attempt ID, original text, creation time, and expiry. Register the result only if its captured attempt is still current. Turn submission resolves the ID under the session lock, rejects unknown/expired/unrelated records, and derives `stt` only for text exactly matching the original; changed text is `stt-edited`. Without a transcription ID, input is typed; an asserted STT source without a valid ID is rejected. Preserve original and edited text separately and never serialize the registry to clients.

Speech-job registration binds a server-issued speech ID to session, attempt, committed turn, authoritative Mandarin reply, voice key, operation ID, status (`pending|ready|failed`), and asset duration when ready. Segment-001 registers each committed reply once; Segment-005 synthesizes/retrieves its audio and updates job status through the agreed store operations. Define the asynchronous job handoff through an owner-coordinated proposal if the existing injected services cannot express it. Network work occurs outside the session lock. TTS failure leaves the committed turn intact.

For NPC playback, use the registered operation ID in `audioPhase`; accept `playing` only for a ready, current-attempt speech job, with a deadline of asset duration plus two seconds. Unknown IDs, overlapping operations, or repeated callbacks cannot create or extend a pause. PA retains its separate `playCue`/`finishCue` lifecycle. Retry invalidates old transcription records, speech jobs, and active operations; old callbacks cannot affect the new attempt. Segment-001 verifies this seam with fixtures before 005 exists. Segment-005 uses equivalent fixture session services while 001 is unavailable, without adding a dependency on 001.

### Provider calls, cancellation, and idempotency

Serialize mutations with short session locks, not a lock held across a provider request. Under the lock, check the version, validate the turn, capture its attempt/context, register one pending turn and its in-flight result, and start the bounded provider pause. Increment the version for this reservation. Release the lock before invoking the provider.

While a turn is pending, allow state reads and a versioned `retryMission`; reject other new gameplay actions/turns with 409. A retry using the current version creates a fresh attempt, clears the old reservation and pauses, and resolves the abandoned turn with retryable 409 `ATTEMPT_ABANDONED`. Best-effort provider cancellation is useful but is not required for correctness. Reads expose the current version so the client can retry without waiting for the original turn.

Reacquire the lock on provider completion and commit only if the attempt ID and pending turn ID still match and the evaluation is valid. A stale completion cannot alter state, release a new attempt's pause, issue speech, or award rewards. On provider failure or invalid output, remove only the matching reservation and pause, advance the version for that bookkeeping, and leave quest facts, patience, and rewards unchanged. Return current state for recovery; retry uses the same turn ID and a fresh expected version.

Check completed/in-flight IDs before rejecting a duplicate's stale expected version. Duplicate pending requests attach to the same result; duplicate completed requests return the original response. Compare semantic payloads excluding `expectedVersion`; reusing an ID with different input/action returns 409. Retryable provider failures are not cached as completed turns. Retain an abandoned-ID tombstone so that ID cannot be submitted into another attempt. Reservation and commit bookkeeping must exclude exactly the bounded provider wait from active time.

## Acceptance criteria

- Full internal-validation API campaign clears P1, P2 and B1 using fixtures, including café cancellation/kiosk and wrong-platform practice repair.
- Wrong boss boarding fails once; sign/application, ticket, PA and target-language gates cannot be skipped; retries start a new attempt.
- Duplicate IDs grant one reward; stale versions conflict; invalid/malformed/late provider results do not transition.
- Fake-clock tests prove provider/playback exclusion, freeze expiry, boss expiry, cooldown, and no tab-based pause.
- Assisted/validation-cue evidence is labeled correctly and raw hidden boss fields never serialize.
- P1 payment rejects selection alone, missing/wrong price, and a cancelled confirmation; correct tea/water price confirmation enables only the valid branch and proximity-guarded payment.
- Fixture audio records prove unchanged/edited/expired/unrelated transcription handling, speech-job registration, duration-bounded playback, and old-attempt callback rejection.
- A deferred provider test proves retry completes before the old provider resolves; its late result has no effect. Duplicate pending turns share one call, changed-payload IDs conflict, and failed-provider retries use the same ID with a fresh version.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

## Exclusions

Do not build frontend presentation or call provider-specific SDKs inside the engine. Do not implement skill promotion here; provide its frozen seam.

## Deliver and merge

Claim `build/segment-001` using the remote claim procedure, implement the scope, and create `[Segment-001] Authoritative engine, authored missions, and session API` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
