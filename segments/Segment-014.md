# Segment-014: Hands-free conversation and Presage adaptation

Spec version 1.3 · Suggested owner D — conversation/sensing · Invocation: **Build Segment-014**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese adventure in React/Vite/Three.js/R3F with Express/Zod and a server-authoritative quest engine. P1/P2/B1 combine Simplified Chinese signs, spoken directions, NPC dialogue and deliberate world actions. Microphone → ElevenLabs STT → Gemini → ElevenLabs speech is required core functionality. The developer validation harness is not a selectable game mode. This post-baseline overhaul assumes verified Segments 007/008/009, keeps their historical packets, and uses spec 1.3. It introduces original papercraft people/city, a close 15° camera, world-first onboarding, contextual UI and permissioned hands-free speech with opt-in Presage delivery cues. Reference images are supplied at build time; no unseen-reference visual claim is permitted. No prior chat context is needed.

Estimate: 4–7 hours; Presage feasibility limited to 60–90 minutes. Nothing in this packet declares implementation complete.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 11, 13, 17–20, and [overhaul interfaces](../docs/OVERHAUL_INTERFACES.md). Inspect current code/tests and merged dependency records. See [planning prompt](../docs/OVERHAUL_PLANNING_PROMPT.md) for reusable context.

## Dependencies

[Segment-010](Segment-010.md)

Required merged records/PR evidence must be verified on remote main. Historical direct integrations require the approved reconciliation procedure, not a dummy PR. A planning assumption never passes the dependency gate. Do not silently rebuild a missing prerequisite. Independent inspection/fixtures can proceed within the protocol; shared implementation waits for prerequisites.

## Writable scope

- apps/web/src/audio/**, apps/web/src/sensing/**
- apps/server/src/routes/encounters.ts, apps/server/src/routes/sensing.ts, apps/server/src/routes/audio.ts, apps/server/src/routes/game.ts (prepared seams only)
- apps/server/src/providers/dialogue.ts, apps/server/src/providers/gemini/**, apps/server/src/providers/elevenlabs/**, apps/server/src/providers/speech.ts, apps/server/src/providers/presage/**
- apps/server/src/session-store.ts (ephemeral encounter/context binding only)
- packages/shared/src/engine/practice-topics.ts, packages/shared/src/content/practice-variants.ts (010 pre-wired seams only)
- apps/web/public/audio/overhaul/**
- apps/web/tests/overhaul/014/**, apps/server/tests/overhaul/014/**, packages/shared/tests/overhaul/014/**
- fixtures/overhaul/014/**
- docs/VOICE_SENSING_REPORT.md
- .build/claims/Segment-014.json, .build/completed/Segment-014.json, .build/proposals/Segment-014.md

All other paths are read-only. Follow the 010 frozen exports. During 011–014, no root dependency/common schema edits: propose exact deltas in the segment proposal and wait for coordination. Each lane uses neutral peer adapters and its own tests/assets/report; do not overwrite another account's branch or claims.

## Build steps

1. Implement VoiceExperience behind frozen props. After explicit mic opt-in, keep one stream armed and gate buffers/uploads to one eligible encounter. Local Web Audio VAD segments bounded MediaRecorder clips; retain 15-second/3-MB limits, silence threshold tuning, echo guard and a visible mute/status. No ambient provider stream or capture during reply/PA.
2. Default disclosed auto-send submits unchanged final server-issued STT once; Review before send and typed accessibility retain IME/source semantics. Preserve one request/job at a time, same-ID failure retry, version refresh, target lock and stale retry/terminal/hidden-tab invalidation. Idle listening cannot register a timer pause.
3. Fill the prepared encounter route with authoritative range/version/attempt guards, one idempotent authored non-spoiling greeting job per NPC/attempt and 30-second encounter cooldown; re-entry/replay cannot renew boss pauses. Greeting has no Gemini/evidence/reward effect and uses the existing bounded queue/job. Suppress greeting if the player speaks first.
4. Validate actual Presage Node SDK FACE/EXPRESSIONS output on the demo machine with explicit camera opt-in. Implement isolated sidecar/custom frame input behind prepared routes and provider; fail neutral when unavailable. Stop frames/tracks/context on revoke. No native import in Vite, no physiological metrics, no extra public port, no stored frames/biometric history. Verify SDK network handling/telemetry off before privacy claims.
5. Create quality/staleness-gated neutral/upbeat/reassuring/calm delivery summary; distinguish SDK/STT/Gemini confidence. Add only advisory context to the single Gemini request; authored critical facts and boss protections stay unchanged. Hesitant players get support rather than patience penalties. Do not claim eye-contact/confidence classification from unsupported signals.
6. Implement authored topic recommendations from actual semantic/repair evidence using 010 hooks, only at mission boundaries with unchanged bounded tiers/fixed boss. Sensor cues can adjust delivery or suggest support, not mastery, XP or correctness.
7. Measure live human Mandarin capture → STT → Gemini → audible TTS inside the world with camera on/off. Record true Presage output separately from fixtures; synthetic audio/camera preview is not human/live acceptance.

## Acceptance criteria

- Entering range allows speaking without E/per-turn recording/Send; single bounded greeting, no overlapping playback/self-transcription, silence/noise never submits.
- Exactly-once final-STT submissions, honest edited/typed provenance and late/abandoned callbacks hold; idle listening never pauses boss.
- Real opt-in Presage face output reaches bounded advisory context, quality/staleness/revocation revert neutral and raw camera data never enters Gemini/public state.
- Camera-off/any expressions with identical language/actions have identical rewards/mastery/quest/boss results; topic recommendations cite actual semantic evidence.
- Live human voice and Presage observations plus outage/mute/noise/hesitation fixtures documented. Missing live Presage remains incomplete; a fixture adapter alone is not complete delivery.

Run npm ci, typecheck, lint, unit/API tests, production build, fixture browser tests and kit validation. Fixtures never stand in for required live/manual evidence. Browser tests belong in the discovered apps/web/tests subtree. Attach reference images for art review and request device permission only through the intended user action.

## Exclusions

app/ui/world edits, shared contracts/barrels/engine index, root package changes, realtime STT migration, full-duplex/barge-in, emotion diagnosis/eye-contact claims, vitals/authentication or generated levels.

## Deliver and merge

Use the protocol claim on build/segment-014; preserve claim history, human Git identity and no AI co-author trailer. Create [Segment-014] Hands-free conversation and Presage adaptation as the PR title and attach it to the task. Synchronize latest main, run all required checks and the packet acceptance, and record exact evidence/limitations with specVersion 1.3. Acquire the normal merge lock only for final integration, require matching green quality CI and current tested head, then normal squash merge and post-merge build/smoke. Do not bypass protection or failing checks. If mandatory references, live acceptance, prerequisites or review are missing, preserve a draft PR and report the specific blocker; do not write a misleading completion record or call queued merging complete.
