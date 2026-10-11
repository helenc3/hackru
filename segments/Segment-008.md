# Segment-008: Submission package and final demo readiness

> Historical (Spec 1.2 planning kit; all segments merged by 2026-10-11). Current contracts: `packages/shared/src/contracts.ts` and `proposals/city-streaming-contracts.md`.

Spec version 1.2 · Suggested owner C/D · Invocation: **Build Segment-008**

## Context available to a fresh account

Speak Your Way is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (historical), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (historical), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 12, 14, 15. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-007](Segment-007.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `docs/SUBMISSION.md`
- `docs/DEMO_SCRIPT.md`
- `docs/FEATURE_MATRIX.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/ASSET_ATTRIBUTION.md`
- `submission/**`
- `.build/claims/Segment-008.json`, `.build/completed/Segment-008.json`, `.build/proposals/Segment-008.md`

All other paths are read-only for this segment unless the human explicitly expands scope. Normal ownership exceptions are coordinated through the protocol, not copied private types.

## Build steps

1. Prepare the concise pitch, three-minute script, architecture summary and feature matrix distinguishing live APIs, authored content, fixtures and deferred functionality.
2. Keep the validation harness out of player-facing promotional images. Capture screenshots and a complete known-good campaign recording where local tools allow, and document the exact tested revision. Record any unavailable media capture as a limitation.
3. Create the final checklist for source link, existing hosted URL if deployed, local launch, attribution, and honest sponsor/API integration explanation.
4. Rehearse the normal path and in-world typed/subtitle accessibility recovery path, using labeled demo checkpoints only if the game already supports them.
5. Keep changes documentary; report remaining hosting/submission action that needs access. Merging this packet does not itself publish or submit externally.

## Acceptance criteria

- Demo script uses the required spoken Mandarin loop in one third-person world and fits roughly three minutes in a timed rehearsal and the full playable campaign was separately checked.
- Submission package references a known-good commit and working local instructions.
- Feature matrix truthfully labels reduced or optional scope; screenshots/media do not imply fixture output is live.
- All asset attributions present; final checks stay green; no unsupported learning-outcome claim.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

## Exclusions

Do not build new features, implement a hidden completion shortcut, change runtime code, or submit to external systems without human authorization.

## Deliver and merge

Claim `build/segment-008` using the remote claim procedure, implement the scope, and create `[Segment-008] Submission package and final demo readiness` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
