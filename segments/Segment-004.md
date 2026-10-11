# Segment-004: Third-person freely navigable district

Spec version 1.2 · Suggested owner D · Invocation: **Build Segment-004**

## Context available to a fresh account

Speak Your Way is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 1, 3, 7, 10, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-000](Segment-000.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `apps/web/src/world/**`
- `apps/web/public/world-assets/**`
- `apps/web/tests/world/**`
- `fixtures/world/**`
- `docs/ASSET_ATTRIBUTION.md`
- `.build/claims/Segment-004.json`, `.build/completed/Segment-004.json`, `.build/proposals/Segment-004.md`

All other paths are read-only for this segment unless the human explicitly expands scope. Normal ownership exceptions are coordinated through the protocol, not copied private types.

## Build steps

1. Build the small scene from frozen coordinates/IDs: plaza, café entrance, kiosk, station and three platforms. Place readable Simplified Chinese signs and spatial landmarks that agree with spoken route instructions. Use a visible capsule/low-poly avatar and third-person follow camera.
2. Implement camera-relative keyboard movement, normalized diagonal speed, flat-ground circle/box collisions, wall sliding, and world bounds. Keep this independent of provider and quest logic.
3. Expose nearby sign/NPC/PA/choice interactions through the shared renderer props, with 2-unit interaction range. Readable DOM sign panels use shared UI callbacks.
4. Pause avatar motion whenever a text/control panel is focused. Escape closes appropriate panels. World must never award XP, translate a sign, or choose the correct platform for the player.
5. Keep fixed camera/capsule fallback, cap rendering cost and record asset attribution. Return a recoverable WebGL failure to the app shell.

## Acceptance criteria

- All required zones and interactables can be reached with keyboard movement; avatar stays visible and cannot cross walls/bounds.
- Same fixture actions as the validation harness produce the same emitted request IDs/choice IDs and no duplicate interaction.
- Dialogue typing does not move the avatar; camera and interaction prompts work on the demo laptop.
- Observe at least 30 fps on the actual demo laptop or simplify to reach the target and record measurement method.
- Unsupported WebGL shows compatibility recovery without promoting the validation harness into gameplay; no unexplained asset license.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

### CI browser note

GitHub Actions runs Playwright Firefox headlessly on Ubuntu without a physical GPU. A CI run failed both world interaction tests while waiting for the renderer's initial `data-position-x`/`data-position-z` attributes; these attributes are written from React Three Fiber's frame loop. If this recurs while local macOS passes, inspect the Playwright trace and error context for Canvas/WebGL initialization or the compatibility recovery screen before increasing test timeouts. The preliminary WebGL probe uses a separate canvas, so it does not prove the scene Canvas can start.

## Exclusions

Do not edit app shell, shared client, authoritative geometry, content IDs, mission logic or providers. No physics engine, animated crowds, jumping, city streaming, or procedural map.

## Deliver and merge

Claim `build/segment-004` using the remote claim procedure, implement the scope, and create `[Segment-004] Third-person freely navigable district` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
