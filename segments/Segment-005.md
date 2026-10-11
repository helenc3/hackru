# Segment-005: Required Mandarin voice loop and PA playback

Spec version 1.2 · Suggested owner B · Invocation: **Build Segment-005**

## Context available to a fresh account

Speak Your Way is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 9, 11, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-000](Segment-000.md), [Segment-002](Segment-002.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `apps/server/src/providers/speech.ts`
- `apps/server/src/providers/elevenlabs/**`
- `apps/server/src/routes/audio.ts`
- `apps/web/src/audio/**`
- `apps/web/public/audio/**`
- `apps/server/tests/audio/**`
- `apps/web/tests/audio/**`
- `fixtures/audio/**`
- `scripts/generate-pa.*`
- `scripts/smoke-elevenlabs.*`
- `.build/claims/Segment-005.json`, `.build/completed/Segment-005.json`, `.build/proposals/Segment-005.md`

All other paths are read-only unless the human explicitly expands scope. Coordinate interface changes through the protocol.

## Build steps

1. Implement user-activated MediaRecorder and the integrated Recorder component: hold-to-talk or click Start/Stop, 15-second/3-MB bounds, capability checks, cancel, and microphone-denial recovery. No recording during playback.
2. Implement server ElevenLabs scribe_v2 batch STT with language_code=zh, no diarization, and original unedited transcription. Return session/attempt-bound transcriptionId plus text; only explicit Send creates a turn. Server derives stt/stt-edited/typed evidence from the recorded original.
3. Use the frozen Gemini provider through game/session services; wire microphone → STT → Gemini evaluation → authored or generated Mandarin reply → ElevenLabs TTS. No second conversational agent and no engine mutations from audio code.
4. Implement NPC TTS with eleven_flash_v2_5 and PA with eleven_multilingual_v2 using Mandarin-tested account-accessible voices. Replies ≤80 Chinese characters; critical numbers use Chinese words. Generate/review P2/B1 PA and short practice coach example clips as local assets.
5. Implement one playback queue, audio enable/mute/stop/replay, async cached speech jobs, bounded lifecycle signals, compact transcript confirmation, and in-world typed/subtitle fallback. Never send pinyin/English coaching to NPC TTS.
6. Handle recognition ambiguity, TTS/STT failure, and retry/aborted-attempt callbacks without patience loss, fake progress, or spoken-evidence inflation. Delete clips after processing and preserve the original transcript only ephemerally.

## Session and engine handoff

Follow the session-record and pending-turn rules in [Segment-001](Segment-001.md). Segment-001 owns exported session-store registration/lookup operations and ephemeral transcription/speech-job registries. Consume them through injected services; do not edit its owned files, keep a second session registry, or mutate quest state from audio routes. If the handoff is not available, use equivalent fixture session services for this segment's acceptance and coordinate the exact interface through `.build/proposals/Segment-005.md`. Segment-001 remains outside this segment's dependency list; full integration is checked in 007.

For STT, capture session/attempt and recording operation under a short lock, release it for the provider call, then register the shared `TranscriptionRecord` only if the same attempt is current. Return its server-issued ID and original text. Segment-001's turn route resolves that record and derives unchanged `stt` versus `stt-edited`; client source flags cannot grant spoken evidence. Reject stale results and expire records rather than registering them into a new attempt. Store original and edited text separately, ephemerally. STT never submits an evaluated turn automatically.

For TTS, consume the once-registered speech job for a committed turn, using the engine's final Mandarin reply and NPC voice key. Synthesize outside the session lock; publish audio/status and measured asset duration only if the job still belongs to the current attempt. Pending retrieval returns 202, ready returns audio, and failed or invalidated jobs return 410; IDs belonging to another session are rejected. Repeated retrieval does not create another job or submit another turn. TTS failure preserves committed gameplay and offers playback retry or accessibility recovery.

Use the job's registered operation ID for NPC `audioPhase` signals. Playback starts only after the job is ready; the server derives the pause bound from asset duration plus two seconds. Stop, replay, duplicate lifecycle messages, and unknown IDs cannot renew the same operation's allowance. PA uses the distinct `playCue`/`finishCue` path. Mission retry cancels local capture/playback and invalidates pending callbacks; cancellation alone is not sufficient, so every server completion also checks its captured attempt.

Game turns reserve state briefly and release the lock during Gemini calls. Keep retry controls available during a pending turn: fetch current state/version and send `retryMission` through the action queue without waiting for the outstanding turn's provider response. Other new gameplay submissions remain blocked while pending. Handle retryable 409 `ATTEMPT_ABANDONED` by discarding the old response and synchronizing state. Provider failures permit the same turn ID with a fresh version; replaying audio never resubmits it.

P1 requires a valid selected drink and correct price confirmation before either payment branch. Coordinate the `confirm_drink_price`/`priceCny` contract proposal described in Segment-001 with the schema/provider owners; this packet does not authorize changes to their files. Voice and typed accessibility feed the same semantic gate. Never infer confirmation from TTS text or label edited/typed confirmation as independent spoken evidence.

## Acceptance criteria

- At least one live recorded Mandarin utterance successfully traverses STT, Gemini and voiced NPC response in the same integrated panel, using fixture session services if 001 has not yet merged. Full world integration is 007.
- Two PA assets match reviewed Mandarin content and active facts. Test short numeral/destination requests with two speakers if available and document actual recognition observations.
- Only Send advances gameplay; edited transcript earns no independent spoken evidence; forged/unrelated transcription IDs are rejected.
- Mic denial/unsupported type/timeout/abort offers re-record or same-panel typed fallback; playback failure leaves valid committed quest state intact.
- No overlapping audio, recording at page load, unbounded confirmation pause, or duplicate action on replay. Boss PA subtitles remain opt-in and mark listening assisted.
- Chinese output/practice audio is audible and intelligible in the chosen voices; real STT/TTS proofs and component/API tests pass without committed recordings or secrets.
- Fixture session-service tests cover original/edited/expired/unrelated transcription records, one speech job per committed reply, authoritative playback duration, and stale STT/TTS results after retry.
- A deferred-turn component test proves mission retry does not wait for Gemini; old replies cannot play in the new attempt, and failed-turn recovery refreshes the version without creating duplicate submissions.

Run all repository checks and fixture browser smoke as well. Live acceptance is additional; unavailable mandatory live evidence keeps the segment incomplete. Never put paid credentials in CI.

## Exclusions

Voice input and output are mandatory here. Do not defer capture/STT to 009, introduce continuous/full-duplex voice, change authored quest facts, or treat typed/browser-TTS behavior as completed ElevenLabs voice acceptance.

## Deliver and merge

Claim `build/segment-005` using the remote claim procedure, implement the scope, and create `[Segment-005] Required Mandarin voice loop and PA playback` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
