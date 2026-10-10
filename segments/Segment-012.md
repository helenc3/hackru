# Segment-012: Papercraft district and close camera

Spec version 1.3 · Suggested owner B — world/camera · Invocation: **Build Segment-012**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese adventure in React/Vite/Three.js/R3F with Express/Zod and a server-authoritative quest engine. P1/P2/B1 combine Simplified Chinese signs, spoken directions, NPC dialogue and deliberate world actions. Microphone → ElevenLabs STT → Gemini → ElevenLabs speech is required core functionality. The developer validation harness is not a selectable game mode. This post-baseline overhaul assumes verified Segments 007/008/009, keeps their historical packets, and uses spec 1.3. It introduces original papercraft people/city, a close 15° camera, world-first onboarding, contextual UI and permissioned hands-free speech with opt-in Presage delivery cues. Reference images are supplied at build time; no unseen-reference visual claim is permitted. No prior chat context is needed.

Estimate: 3–5 hours. Nothing in this packet declares implementation complete.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 11, 13, 17–20, and [overhaul interfaces](../docs/OVERHAUL_INTERFACES.md). Inspect current code/tests and merged dependency records. See [planning prompt](../docs/OVERHAUL_PLANNING_PROMPT.md) for reusable context.

## Dependencies

[Segment-010](Segment-010.md)

Required merged records/PR evidence must be verified on remote main. Historical direct integrations require the approved reconciliation procedure, not a dummy PR. A planning assumption never passes the dependency gate. Do not silently rebuild a missing prerequisite. Independent inspection/fixtures can proceed within the protocol; shared implementation waits for prerequisites.

## Writable scope

- apps/web/src/world/** except characters/**
- apps/web/public/art/environment/**
- apps/web/tests/overhaul/012/**
- fixtures/overhaul/012/**
- docs/WORLD_OVERHAUL_REPORT.md
- .build/claims/Segment-012.json, .build/completed/Segment-012.json, .build/proposals/Segment-012.md

All other paths are read-only. Follow the 010 frozen exports. During 011–014, no root dependency/common schema edits: propose exact deltas in the segment proposal and wait for coordination. Each lane uses neutral peer adapters and its own tests/assets/report; do not overwrite another account's branch or claims.

## Build steps

1. Consume CharacterModel from 010 with neutral assets until 011 merges. Read references/shared tokens; keep actual café/kiosk/concourse/platform/train semantics and all manifest coordinates/colliders unchanged.
2. Build paper-fold geometry, city silhouettes, café awning, ticket windows, platform shelters/speaker fixtures and a stationary train. Preserve every walkable route and readable authored Chinese sign. Remove floating geographic labels/minimap; keep real signage/platform numbers.
3. Set close follow camera near distance 4.5, target height 1.2, downward pitch 15° from horizontal and FOV 55. Tune within specified bounds, handle occlusion without wall/floor clipping and retain visible avatar. Record actual configuration.
4. Emit stable nearest-NPC proximity through the frozen callback only after authoritative position flush; 2-unit entry, 2.75-unit exit, 300 ms dwell and deterministic ties. Presentation focus cannot bypass server guards. Keep explicit sign/payment/boarding interactions and optional E accessibility.
5. Verify typing/IME/modal focus, routes/sign visibility and repeated target-boundary movement. Observe ≥30 FPS on actual demo laptop; CI must prove rendering but is not the laptop FPS measurement.

## Acceptance criteria

- Actual district and avatar render in preview/active scene; no floating geography labels; Chinese task signs remain readable.
- All frozen routes/zones/NPCs/choices reachable; close camera keeps avatar and destinations legible with collision-safe movement.
- Proximity is deterministic and only published after position sync; boundaries do not oscillate or change targets mid-locked encounter.
- Reference review and real demo-laptop FPS evidence are recorded; no copied mountains replacing required station/train; all repository/world checks pass.

Run npm ci, typecheck, lint, unit/API tests, production build, fixture browser tests and kit validation. Fixtures never stand in for required live/manual evidence. Browser tests belong in the discovered apps/web/tests subtree. Attach reference images for art review and request device permission only through the intended user action.

## Exclusions

Character implementation, app/UI/audio/provider edits, manifest ID/coordinate/guard changes, root packages, vehicle simulation, navmesh/physics or hidden correct-route markers.

## Deliver and merge

Use the protocol claim on build/segment-012; preserve claim history, human Git identity and no AI co-author trailer. Create [Segment-012] Papercraft district and close camera as the PR title and attach it to the task. Synchronize latest main, run all required checks and the packet acceptance, and record exact evidence/limitations with specVersion 1.3. Acquire the normal merge lock only for final integration, require matching green quality CI and current tested head, then normal squash merge and post-merge build/smoke. Do not bypass protection or failing checks. If mandatory references, live acceptance, prerequisites or review are missing, preserve a draft PR and report the specific blocker; do not write a misleading completion record or call queued merging complete.
