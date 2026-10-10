# Segment-013: World-first onboarding and contextual interface

Spec version 1.3 · Suggested owner C — interface · Invocation: **Build Segment-013**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese adventure in React/Vite/Three.js/R3F with Express/Zod and a server-authoritative quest engine. P1/P2/B1 combine Simplified Chinese signs, spoken directions, NPC dialogue and deliberate world actions. Microphone → ElevenLabs STT → Gemini → ElevenLabs speech is required core functionality. The developer validation harness is not a selectable game mode. This post-baseline overhaul assumes verified Segments 007/008/009, keeps their historical packets, and uses spec 1.3. It introduces original papercraft people/city, a close 15° camera, world-first onboarding, contextual UI and permissioned hands-free speech with opt-in Presage delivery cues. Reference images are supplied at build time; no unseen-reference visual claim is permitted. No prior chat context is needed.

Estimate: 3–5 hours. Nothing in this packet declares implementation complete.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 11, 13, 17–20, and [overhaul interfaces](../docs/OVERHAUL_INTERFACES.md). Inspect current code/tests and merged dependency records. See [planning prompt](../docs/OVERHAUL_PLANNING_PROMPT.md) for reusable context.

## Dependencies

[Segment-010](Segment-010.md)

Required merged records/PR evidence must be verified on remote main. Historical direct integrations require the approved reconciliation procedure, not a dummy PR. A planning assumption never passes the dependency gate. Do not silently rebuild a missing prerequisite. Independent inspection/fixtures can proceed within the protocol; shared implementation waits for prerequisites.

## Writable scope

- apps/web/src/app/**
- apps/web/src/ui/**
- apps/web/src/validation/** (compatibility only)
- apps/web/tests/overhaul/013/**
- fixtures/overhaul/013/**
- docs/PLAYER_EXPERIENCE_REPORT.md
- .build/claims/Segment-013.json, .build/completed/Segment-013.json, .build/proposals/Segment-013.md

All other paths are read-only. Follow the 010 frozen exports. During 011–014, no root dependency/common schema edits: propose exact deltas in the segment proposal and wait for coordination. Each lane uses neutral peer adapters and its own tests/assets/report; do not overwrite another account's branch or claims.

## Build steps

1. Mount 010 WorldPreview immediately and introduce one accessible modal over the actual district. No fake active state or timer before onboarding; handle Continue/expired sessions without duplicate starts.
2. Use the urgent train-context intro, short movement/voice instructions and Easy/Hard mapping to initial tiers 0/1. Delegate mic/audio/camera tests and lifecycle to 010/014 DeviceControls facades; never edit their implementation or acquire a second stream. Camera sensing has separate optional consent.
3. Replace landing/sidebar/action directory/log/diagnostic footer with world overlays: compact activity, NPC captions, contextual sign/deliberate choice controls, brief practice feedback and terminal debrief. Expose restart/leave/accessibility/objective/time/inventory in small settings; preserve visible timer information and fixture/degraded honesty.
4. Wire automatic proximity focus and VoiceExperience props through existing useSession transport. Maintain pending-turn retry, shared queue/version handling, truthful source labels, IME, keyboard focus and Escape. Do not let settings/dialogue pause active boss except existing bounded server audio phases.
5. Verify no-permission, camera-off, typed fallback, WebGL loss, server restart/expired session and terminal replay paths. Preserve developer-only validation routing and production blocking.

## Acceptance criteria

- First visible scene is actual world behind one introduction modal; no persistent sidebar/floating location IDs/diagnostic footer.
- Easy/Hard use existing tiers and never bypass missions; setup does not consume active mission time.
- Device checks are genuine, untested/denied states honest; no devices requested on page load, optional camera has complete playable fallback.
- NPC/sign/choice/coach/result are contextual, keyboard/IME usable and active boss exposes no hints/coaching/evaluator values. Baseline validation harness still blocked in production.
- Continue/outages/late-turn retry and source labels remain correct; screenshots reviewed at 1440×900; all checks pass.

Run npm ci, typecheck, lint, unit/API tests, production build, fixture browser tests and kit validation. Fixtures never stand in for required live/manual evidence. Browser tests belong in the discovered apps/web/tests subtree. Attach reference images for art review and request device permission only through the intended user action.

## Exclusions

world/**, audio/**, sensing/** implementations, server/shared engine/schema/root packages, full mobile layout, new quest graphs or device permission without a user gesture.

## Deliver and merge

Use the protocol claim on build/segment-013; preserve claim history, human Git identity and no AI co-author trailer. Create [Segment-013] World-first onboarding and contextual interface as the PR title and attach it to the task. Synchronize latest main, run all required checks and the packet acceptance, and record exact evidence/limitations with specVersion 1.3. Acquire the normal merge lock only for final integration, require matching green quality CI and current tested head, then normal squash merge and post-merge build/smoke. Do not bypass protection or failing checks. If mandatory references, live acceptance, prerequisites or review are missing, preserve a draft PR and report the specific blocker; do not write a misleading completion record or call queued merging complete.
