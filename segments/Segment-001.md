# Segment-001: Authoritative engine, authored missions, and session API

Spec version 1.2 · Suggested owner A · Invocation: **Build Segment-001**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 3, 4, 5, 7, 11, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

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

## Acceptance criteria

- Full internal-validation API campaign clears P1, P2 and B1 using fixtures, including café cancellation/kiosk and wrong-platform practice repair.
- Wrong boss boarding fails once; sign/application, ticket, PA and target-language gates cannot be skipped; retries start a new attempt.
- Duplicate IDs grant one reward; stale versions conflict; invalid/malformed/late provider results do not transition.
- Fake-clock tests prove provider/playback exclusion, freeze expiry, boss expiry, cooldown, and no tab-based pause.
- Assisted/validation-cue evidence is labeled correctly and raw hidden boss fields never serialize.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

## Exclusions

Do not build frontend presentation or call provider-specific SDKs inside the engine. Do not implement skill promotion here; provide its frozen seam.

## Deliver and merge

Claim `build/segment-001` using the remote claim procedure, implement the scope, and create `[Segment-001] Authoritative engine, authored missions, and session API` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
