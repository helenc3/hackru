# Segment-015: Overhaul integration and refreshed demo package

Spec version 1.3 · Suggested owner Integration lead with all four reviewers · Invocation: **Build Segment-015**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese adventure in React/Vite/Three.js/R3F with Express/Zod and a server-authoritative quest engine. P1/P2/B1 combine Simplified Chinese signs, spoken directions, NPC dialogue and deliberate world actions. Microphone → ElevenLabs STT → Gemini → ElevenLabs speech is required core functionality. The developer validation harness is not a selectable game mode. This post-baseline overhaul assumes verified Segments 007/008/009, keeps their historical packets, and uses spec 1.3. It introduces original papercraft people/city, a close 15° camera, world-first onboarding, contextual UI and permissioned hands-free speech with opt-in Presage delivery cues. Reference images are supplied at build time; no unseen-reference visual claim is permitted. No prior chat context is needed.

Estimate: 2–3 hours including live rehearsal. Nothing in this packet declares implementation complete.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 11, 13, 17–20, and [overhaul interfaces](../docs/OVERHAUL_INTERFACES.md). Inspect current code/tests and merged dependency records. See [planning prompt](../docs/OVERHAUL_PLANNING_PROMPT.md) for reusable context.

## Dependencies

[Segment-011](Segment-011.md), [Segment-012](Segment-012.md), [Segment-013](Segment-013.md), [Segment-014](Segment-014.md)

Required merged records/PR evidence must be verified on remote main. Historical direct integrations require the approved reconciliation procedure, not a dummy PR. A planning assumption never passes the dependency gate. Do not silently rebuild a missing prerequisite. Independent inspection/fixtures can proceed within the protocol; shared implementation waits for prerequisites.

## Writable scope

- apps/** (compatible cross-lane fixes only)
- packages/shared/** (compatible integration fixes only)
- package.json, package-lock.json, .github/workflows/** (necessary integration checks only)
- apps/web/tests/overhaul/015/**, apps/server/tests/overhaul/015/**, packages/shared/tests/overhaul/015/**
- fixtures/overhaul/015/**
- docs/OVERHAUL_INTEGRATION_REPORT.md, docs/LOCAL_LAUNCH.md, docs/DEMO_SCRIPT.md, docs/FEATURE_MATRIX.md, docs/RELEASE_CHECKLIST.md, docs/ASSET_ATTRIBUTION.md, docs/SUBMISSION.md
- submission/** (refresh only)
- .build/claims/Segment-015.json, .build/completed/Segment-015.json, .build/proposals/Segment-015.md

All other paths are read-only. Follow the 010 frozen exports. During 011–014, no root dependency/common schema edits: propose exact deltas in the segment proposal and wait for coordination. Each lane uses neutral peer adapters and its own tests/assets/report; do not overwrite another account's branch or claims.

## Build steps

1. Verify all four completion records and corresponding merges; integrate against latest main under the protocol lock. Repair actual compatible seams only; no late feature additions or unrelated cleanup.
2. Run full real-server fixture harness/world P1 café/kiosk, P2 direct/clarification/wrong-board and B1 clear/fail, with matching objectives/inventory/results. Check boss no-help, paused-time bounds, rewards/provenance, duplicates/outages and retry/late-callback invalidation.
3. Run a real live world mission combining Chinese sign, human recorded Mandarin, Gemini/ElevenLabs reply and navigation/action; repeat camera-off and validate actual Presage advisory output. Obtain art/reference human review. Missing mandatory live/manual evidence leaves completion pending, not inherited from baseline.
4. Measure ten spoken cycles and ≥30 FPS on the actual demo laptop with camera/voice; record sample median/range, segmentation/provider/playback stages and review time separately. Test native failure, denied permissions, expired session and production same-origin assets/API with harness absent.
5. Refresh already-built 008 screenshots/demo script/feature matrix/attributions to the tested revision. Document which 009 pacing behavior survives hands-free changes and any reduced targets. Keep degraded/fixture explanations honest.
6. Run all clean-install/repository checks, matching CI and post-merge build/smoke. Publish/submit only if separately authorized; this request authorizes source integration, not hosting or external entry submission.

## Acceptance criteria

- Complete combined fixture campaign and live human voiced mission pass on current main plus branch; production UI/API/PA assets and expiry recovery verified.
- Papercraft original people/actual station, close camera, world-first UI and hands-free proximity loop satisfy spec 17–20.
- Live Presage and camera-off invariance proven, or segment remains pending until a separately authorized reduced release is recorded.
- All required checks green with no skipped world failures; exact live/fixture/manual scope, FPS/latency and residual cuts are reported.
- Updated demo/submission package references the tested revision and distinct source/fixture/live claims; merged revision is verified after normal merge.

Run npm ci, typecheck, lint, unit/API tests, production build, fixture browser tests and kit validation. Fixtures never stand in for required live/manual evidence. Browser tests belong in the discovered apps/web/tests subtree. Attach reference images for art review and request device permission only through the intended user action.

## Exclusions

New gameplay/languages/world, speculative physiological/gaze features, redesign of frozen contracts, concealed missing core acceptance, security/branch-protection changes or publication without authorization.

## Deliver and merge

Use the protocol claim on build/segment-015; preserve claim history, human Git identity and no AI co-author trailer. Create [Segment-015] Overhaul integration and refreshed demo package as the PR title and attach it to the task. Synchronize latest main, run all required checks and the packet acceptance, and record exact evidence/limitations with specVersion 1.3. Acquire the normal merge lock only for final integration, require matching green quality CI and current tested head, then normal squash merge and post-merge build/smoke. Do not bypass protection or failing checks. If mandatory references, live acceptance, prerequisites or review are missing, preserve a draft PR and report the specific blocker; do not write a misleading completion record or call queued merging complete.
