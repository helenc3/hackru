# Segment-005: Required Mandarin voice loop and PA playback

Spec version 1.2 · Suggested owner B · Invocation: **Build Segment-005**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 9, 11, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

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

## Acceptance criteria

- At least one live recorded Mandarin utterance successfully traverses STT, Gemini and voiced NPC response in the same integrated panel, using fixture session services if 001 has not yet merged. Full world integration is 007.
- Two PA assets match reviewed Mandarin content and active facts. Test short numeral/destination requests with two speakers if available and document actual recognition observations.
- Only Send advances gameplay; edited transcript earns no independent spoken evidence; forged/unrelated transcription IDs are rejected.
- Mic denial/unsupported type/timeout/abort offers re-record or same-panel typed fallback; playback failure leaves valid committed quest state intact.
- No overlapping audio, recording at page load, unbounded confirmation pause, or duplicate action on replay. Boss PA subtitles remain opt-in and mark listening assisted.
- Chinese output/practice audio is audible and intelligible in the chosen voices; real STT/TTS proofs and component/API tests pass without committed recordings or secrets.

Run all repository checks and fixture browser smoke as well. Live acceptance is additional; unavailable mandatory live evidence keeps the segment incomplete. Never put paid credentials in CI.

## Exclusions

Voice input and output are mandatory here. Do not defer capture/STT to 009, introduce continuous/full-duplex voice, change authored quest facts, or treat typed/browser-TTS behavior as completed ElevenLabs voice acceptance.

## Deliver and merge

Claim `build/segment-005` using the remote claim procedure, implement the scope, and create `[Segment-005] Required Mandarin voice loop and PA playback` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
