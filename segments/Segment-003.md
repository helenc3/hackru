# Segment-003: Integrated game UI and internal text validation

Spec version 1.2 · Suggested owner C · Invocation: **Build Segment-003**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 2, 3, 4, 5, 7, 10, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-000](Segment-000.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `apps/web/src/app/**`
- `apps/web/src/validation/**`
- `apps/web/src/ui/** (except SkillDebrief.tsx)`
- `apps/web/src/styles/**`
- `apps/web/tests/ui/**`
- `apps/web/tests/validation/**`
- `fixtures/ui/**`
- `fixtures/validation/**`
- `.build/claims/Segment-003.json`, `.build/completed/Segment-003.json`, `.build/proposals/Segment-003.md`

All other paths are read-only unless the human explicitly expands scope. Coordinate interface changes through the protocol.

## Build steps

1. Build the shared session client against baseline fixtures and the frozen HTTP API. The production app has one world view with integrated HUD/dialogue, not a text/world selector.
2. Create the developer-only ValidationHarness for locations, cues, typed test turns and branch validation. Require server validation config; reject production access and keep its simulated achievements separate from real player results.
3. Build Start/Continue, microphone/audio setup, nearby NPC dialogue, sign overlays, objective HUD, payment/boarding action affordances, practice coach, inventory and result screens. Mount Recorder/AudioController slots owned by 005 and SkillDebrief owned by 006.
4. Make the NPC panel voice-led: recording/listening/pending indicators and compact transcript confirmation. Provide Hanzi typed accessibility fallback in that same panel; Chinese IME composition must never cause premature Send. Do not implement the recorder/provider here.
5. Handle stale version, expired session, pending audio, provider errors, microphone denial, and WebGL compatibility. Preserve one coherent session and language/action flow; no correctness inference or quest grants in the UI.

## Acceptance criteria

- Fixture browser journeys cover all mission outcomes using internal validation, with no production link or Text/World toggle.
- World HUD/dialogue presents signs, voice slot, NPC replies and action controls as one interface; typed fallback remains in the same panel.
- Active boss has no English/pinyin coach, hint/freeze, answer chips, or numeric correctness meter. Chinese NPC subtitles are allowed.
- Chinese glyphs render, IME composition Enter does not Send, and focusing dialogue never moves the avatar.
- Client transports state/actions reliably and simulated validation never grants real achievements. Real voiced campaign is accepted by 007.

Run all repository checks and fixture browser smoke as well. Live acceptance is additional; unavailable mandatory live evidence keeps the segment incomplete. Never put paid credentials in CI.

## Exclusions

Do not build 3D movement, speech capture/providers, or language evaluation. Do not promote the validation harness to a shipped gameplay edition. Leave SkillDebrief and audio modules to their owners.

## Deliver and merge

Claim `build/segment-003` using the remote claim procedure, implement the scope, and create `[Segment-003] Integrated game UI and internal text validation` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
