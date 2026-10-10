# Segment-011: Original papercraft characters

Spec version 1.3 · Suggested owner A — characters · Invocation: **Build Segment-011**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese adventure in React/Vite/Three.js/R3F with Express/Zod and a server-authoritative quest engine. P1/P2/B1 combine Simplified Chinese signs, spoken directions, NPC dialogue and deliberate world actions. Microphone → ElevenLabs STT → Gemini → ElevenLabs speech is required core functionality. The developer validation harness is not a selectable game mode. This post-baseline overhaul assumes verified Segments 007/008/009, keeps their historical packets, and uses spec 1.3. It introduces original papercraft people/city, a close 15° camera, world-first onboarding, contextual UI and permissioned hands-free speech with opt-in Presage delivery cues. Reference images are supplied at build time; no unseen-reference visual claim is permitted. No prior chat context is needed.

Estimate: 2–4 hours. Nothing in this packet declares implementation complete.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 11, 13, 17–20, and [overhaul interfaces](../docs/OVERHAUL_INTERFACES.md). Inspect current code/tests and merged dependency records. See [planning prompt](../docs/OVERHAUL_PLANNING_PROMPT.md) for reusable context.

## Dependencies

[Segment-010](Segment-010.md)

Required merged records/PR evidence must be verified on remote main. Historical direct integrations require the approved reconciliation procedure, not a dummy PR. A planning assumption never passes the dependency gate. Do not silently rebuild a missing prerequisite. Independent inspection/fixtures can proceed within the protocol; shared implementation waits for prerequisites.

## Writable scope

- apps/web/src/world/characters/**
- apps/web/public/art/characters/**
- apps/web/tests/overhaul/011/**
- fixtures/overhaul/011/**
- docs/CHARACTER_ART_REPORT.md
- .build/claims/Segment-011.json, .build/completed/Segment-011.json, .build/proposals/Segment-011.md

All other paths are read-only. Follow the 010 frozen exports. During 011–014, no root dependency/common schema edits: propose exact deltas in the segment proposal and wait for coordination. Each lane uses neutral peer adapters and its own tests/assets/report; do not overwrite another account's branch or claims.

## Build steps

1. Read the frozen CharacterModel/material interface and the shared reference manifest. Request the images at art-build time if unavailable; layout/provisional geometry may continue but reference-match acceptance stays pending.
2. Design original generic Xiaolin, Achen, Lao Zhou and avatar, borrowing paper treatment/palette/proportions only. Create front/side/back reference sheets and actual renderable folded low-poly meshes or licensed assets; preserve approximate height 1.7 and origin at feet. Do not clone reference identities.
3. Implement reusable materials and modest idle/listening/speaking/greeting states behind the already-mounted component. No NPC positions, collision or quest rules inside the model. Use generated raster assets only where they benefit texture/sheet work; do not confuse images with 3D delivery.
4. Check legibility/distinct silhouettes under close-camera lighting, texture budgets and missing-asset recovery. Record generator/source/license/reference treatment. Supply visual review captures and manual review evidence.
5. Merge independently against 010 neutral environment/UI; do not edit WorldRenderer or wait for 012.

## Acceptance criteria

- All four original generic models render through the frozen import and are recognizable at the close-camera scale.
- Attached-reference comparison shows shared papercraft treatment without copied character identities; missing references leave acceptance pending.
- Idle/greeting/speaking states do not change NPC location, player collision radius or callback behavior; fallback material works.
- Character asset attribution and observed draw/texture budgets are documented; repository checks remain green.

Run npm ci, typecheck, lint, unit/API tests, production build, fixture browser tests and kit validation. Fixtures never stand in for required live/manual evidence. Browser tests belong in the discovered apps/web/tests subtree. Attach reference images for art review and request device permission only through the intended user action.

## Exclusions

World placement/camera, app/UI/audio/provider files, shared schema/root dependency edits, skeletal rigs, facial capture/identity replication or lip sync.

## Deliver and merge

Use the protocol claim on build/segment-011; preserve claim history, human Git identity and no AI co-author trailer. Create [Segment-011] Original papercraft characters as the PR title and attach it to the task. Synchronize latest main, run all required checks and the packet acceptance, and record exact evidence/limitations with specVersion 1.3. Acquire the normal merge lock only for final integration, require matching green quality CI and current tested head, then normal squash merge and post-merge build/smoke. Do not bypass protection or failing checks. If mandatory references, live acceptance, prerequisites or review are missing, preserve a draft PR and report the specific blocker; do not write a misleading completion record or call queued merging complete.
