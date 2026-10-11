# Segment-000: Repository bootstrap and contract freeze

Spec version 1.2 · Suggested owner A · Invocation: **Build Segment-000**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 1, 6, 7, 11, 12. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

None; this is the bootstrap.

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `package.json`
- `package-lock.json`
- `.nvmrc`
- `.gitignore`
- `.github/workflows/**`
- `tsconfig*.json`
- `eslint.config.*`
- `apps/** (initial scaffolding only)`
- `packages/shared/** (schemas and fixtures only)`
- `fixtures/baseline/**`
- `scripts/check-kit.*`
- `.build/claims/Segment-000.json`, `.build/completed/Segment-000.json`, `.build/proposals/Segment-000.md`

All other paths are read-only for this segment unless the human explicitly expands scope. Normal ownership exceptions are coordinated through the protocol, not copied private types.

## Build steps

1. Create one npm-workspace TypeScript repository with Vite/React 19/R3F 9 web app and Express server. Pin compatible resolved dependencies and Node runtime. Commit one lockfile.
2. Implement exported TypeScript and Zod schemas from the specification and CONTRACT_FREEZE.md, including mission graphs, internal state, renderer props, debrief, and bounded audio lifecycle actions. Define every ID/intent/choice enum and freeze it before other work.
3. Create the agreed module entry points, dependency injection, mounted route stubs, one production world slot, development-only validation entry, voice/debrief slots, shared scene manifest, .env.example with names only, and baseline request/response/evaluation fixtures. Stubs say unimplemented and do not pretend to complete missions.
4. Establish typecheck, lint, test, build, test:e2e and quality CI. Include substantive schema/fixture tests and a browser shell smoke test. Future features do not have fake passing acceptance tests.
5. Configure local development and single-origin production serving. Add setup/launch notes and keep paid API tests outside CI. Verify provider configuration flags without logging keys.

## Acceptance criteria

- A clean checkout installs with npm ci and all six required command stages succeed, including a substantive fixture test and browser shell test.
- Web shell, Chinese glyphs, health endpoint, explicit unimplemented router responses, and WebGL compatibility screen appear correctly.
- Shared fixtures validate, boss fixture omits coach/vibe, scene locations are reachable by geometry review, and all module seams exist.
- Document exact runtime and command names so another account can start 001–004 without guessing.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

## Exclusions

Do not implement the game engine, NPC intelligence, full text UI, or world movement. Provider live access is checked in 002/005, not fabricated here.

## Deliver and merge

Claim `build/segment-000` using the remote claim procedure, implement the scope, and create `[Segment-000] Repository bootstrap and contract freeze` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
