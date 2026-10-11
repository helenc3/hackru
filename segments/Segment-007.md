# Segment-007: Integrated acceptance and production build

Spec version 1.2 · Suggested owner A · Invocation: **Build Segment-007**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 2, 11, 12, 13, 14. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-000](Segment-000.md), [Segment-001](Segment-001.md), [Segment-002](Segment-002.md), [Segment-003](Segment-003.md), [Segment-004](Segment-004.md), [Segment-005](Segment-005.md), [Segment-006](Segment-006.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `apps/** (integration fixes only)`
- `packages/shared/** (compatible integration fixes only)`
- `package.json`
- `package-lock.json`
- `.github/workflows/**`
- `tests/e2e/**`
- `fixtures/integration/**`
- `docs/INTEGRATION_REPORT.md`
- `docs/LOCAL_LAUNCH.md`
- `.build/claims/Segment-007.json`, `.build/completed/Segment-007.json`, `.build/proposals/Segment-007.md`

All other paths are read-only for this segment unless the human explicitly expands scope. Normal ownership exceptions are coordinated through the protocol, not copied private types.

## Build steps

1. Require developer harness absence from production navigation and verified Mandarin content/audio. Wire already implemented factories, routes, client, renderers, speech lifecycle and debrief seams. Resolve actual integration defects without redesigning the frozen product.
2. Run full fixture campaigns through the internal validation harness and world, compare resulting objectives/inventory/result state, and cover boss protections, retries, duplicate requests, late callbacks and provider outage.
3. Measure 10 real dialogue turns and required STT/Gemini/TTS spoken round trips on the demo connection; run actual Gemini/ElevenLabs acceptance and record observations rather than advertised latency.
4. Prepare the single-origin production build and local fallback with documented commands and expired-session recovery. Smoke-test a hosted build if an existing deployment target is already authorized; otherwise prepare it and report publishing separately.
5. Apply hour-based scope cuts from the spec if needed, listing reduced features honestly. Restore green checks after every compatible seam fix.

## Acceptance criteria

- All repository commands and complete three-mission harness/world fixture journeys pass on current main plus this branch.
- At least one live world mission combines sign reading, recorded Mandarin, Gemini interpretation, spoken ElevenLabs reply, and consequential navigation/action, or the missing requirement keeps this segment incomplete.
- Boss cannot access coaching via API or UI; timers/rewards/evidence behavior survives provider errors.
- Production server serves UI, API and PA assets correctly; local launch succeeds from documented steps.
- Integration report records live/fixture scope, latency observations, demo laptop graphics check, residual risks and any cuts.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

## Exclusions

Do not add new game features, publish without authorization, change repository security policies, or conceal a missing core target under fixture results.

## Deliver and merge

Claim `build/segment-007` using the remote claim procedure, implement the scope, and create `[Segment-007] Integrated acceptance and production build` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
