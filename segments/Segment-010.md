# Segment-010: Overhaul contracts and parallel preparation

Spec version 1.3 · Suggested owner Integration lead · Invocation: **Build Segment-010**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese adventure in React/Vite/Three.js/R3F with Express/Zod and a server-authoritative quest engine. P1/P2/B1 combine Simplified Chinese signs, spoken directions, NPC dialogue and deliberate world actions. Microphone → ElevenLabs STT → Gemini → ElevenLabs speech is required core functionality. The developer validation harness is not a selectable game mode. This post-baseline overhaul assumes verified Segments 007/008/009, keeps their historical packets, and uses spec 1.3. It introduces original papercraft people/city, a close 15° camera, world-first onboarding, contextual UI and permissioned hands-free speech with opt-in Presage delivery cues. Reference images are supplied at build time; no unseen-reference visual claim is permitted. No prior chat context is needed.

Estimate: 60–120 minutes; SDK feasibility at most 60–90 minutes. Nothing in this packet declares implementation complete.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 11, 13, 17–20, and [overhaul interfaces](../docs/OVERHAUL_INTERFACES.md). Inspect current code/tests and merged dependency records. See [planning prompt](../docs/OVERHAUL_PLANNING_PROMPT.md) for reusable context.

## Dependencies

[Segment-007](Segment-007.md), [Segment-008](Segment-008.md), [Segment-009](Segment-009.md)

Required merged records/PR evidence must be verified on remote main. Historical direct integrations require the approved reconciliation procedure, not a dummy PR. A planning assumption never passes the dependency gate. Do not silently rebuild a missing prerequisite. Independent inspection/fixtures can proceed within the protocol; shared implementation waits for prerequisites.

## Writable scope

- packages/shared/src/contracts.ts, packages/shared/src/index.ts (additive exports only)
- packages/shared/src/engine/index.ts (neutral topic-policy hook only)
- packages/shared/src/engine/practice-topics.ts, packages/shared/src/content/practice-variants.ts (neutral interfaces only)
- apps/web/src/world/** (extract/mount existing behavior only)
- apps/web/src/app/**, apps/web/src/ui/**, apps/web/src/audio/**, apps/web/src/sensing/** (facades and neutral mounts only)
- apps/server/src/app.ts, apps/server/src/config.ts, apps/server/src/services.ts, apps/server/src/routes/encounters.ts, apps/server/src/routes/sensing.ts (mount/disabled defaults only)
- apps/server/src/providers/presage/** (provider contract/disabled adapter only)
- apps/server/src/routes/game.ts, apps/server/src/session-store.ts (neutral context lookup hookup only)
- package.json, package-lock.json, apps/server/package.json, .env.example (names only; no keys)
- apps/web/tests/overhaul/010/**, apps/server/tests/overhaul/010/**, packages/shared/tests/overhaul/010/**
- fixtures/overhaul/010/**, docs/OVERHAUL_INTERFACES.md, docs/OVERHAUL_BASELINE.md, docs/PAPERCRAFT_REFERENCE_MANIFEST.md
- .build/claims/Segment-010.json, .build/completed/Segment-010.json, .build/proposals/Segment-010.md

All other paths are read-only. Follow the 010 frozen exports. During 011–014, no root dependency/common schema edits: propose exact deltas in the segment proposal and wait for coordination. Each lane uses neutral peer adapters and its own tests/assets/report; do not overwrite another account's branch or claims.

## Build steps

1. Verify actual remote completion/PR/check/live evidence for 007/008/009. Record exact main revision and known failures in OVERHAUL_BASELINE; an assumption is not completion. Reconcile historical direct integration records through the approved protocol before claiming baseline acceptance.
2. Extract District/NPC/avatar internals into pre-mounted CharacterModel, Environment and Scene/WorldPreview seams while preserving current defaults. Preview uses a non-progressing presentation projection, never fake PublicState. Add optional proximity callback while legacy E remains functional.
3. Freeze exported props/runtime schemas, optional deliveryContextId and server-bound context lookup, neutral style policy and authored-topic hook. Mount encounter/sensing routes with disabled/neutral adapters. Existing requests/fixtures parse unchanged. Do not implement hands-free capture or live sensing as part of this preparation.
4. Verify reference availability/palette/material budget and publish exact file/asset interfaces. Investigate official Presage package/platform/account requirements without recording a camera before permission; timebox feasibility. Pin only verified necessary optional dependencies, isolate native imports from Vite and normal startup; neutral fallback must boot without the SDK/key.
5. Publish exact ownership in the interfaces document and record a working 010 revision for all four lanes. Demonstrate that each facade runs without another lane. Do not leave consumers dependent on unmerged peer exports.

## Acceptance criteria

- Baseline audit distinguishes historical records and actual integrated acceptance; no invented completed PRs or live proof.
- Extraction preserves existing campaign/voice behavior and all required checks pass. Existing 1.2 fixtures parse; omitted style/proximity props retain neutral/baseline behavior.
- WorldPreview renders real geometry without an active session or quest timer. Disabled camera/native provider starts and tears down harmlessly.
- Four consumer seams import and mount independently; exact exported types, fixtures, route bounds and dependency pinning are frozen before parallel dispatch.

Run npm ci, typecheck, lint, unit/API tests, production build, fixture browser tests and kit validation. Fixtures never stand in for required live/manual evidence. Browser tests belong in the discovered apps/web/tests subtree. Attach reference images for art review and request device permission only through the intended user action.

## Exclusions

No art generation, UI redesign, hands-free product implementation, physiological analysis, live camera capture without user action, hosting migration or false dependency acceptance. Preparation stubs are permitted here only and visibly disabled.

## Deliver and merge

Use the protocol claim on build/segment-010; preserve claim history, human Git identity and no AI co-author trailer. Create [Segment-010] Overhaul contracts and parallel preparation as the PR title and attach it to the task. Synchronize latest main, run all required checks and the packet acceptance, and record exact evidence/limitations with specVersion 1.3. Acquire the normal merge lock only for final integration, require matching green quality CI and current tested head, then normal squash merge and post-merge build/smoke. Do not bypass protection or failing checks. If mandatory references, live acceptance, prerequisites or review are missing, preserve a draft PR and report the specific blocker; do not write a misleading completion record or call queued merging complete.
