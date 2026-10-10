# Overhaul interface preparation and ownership

Planning freeze 1.3. These interfaces do not exist until Segment-010 implements and merges them. Read specification sections 17–20. Segments 007/008/009 are assumed future prerequisites, not declared complete by this file. Resolve actual baseline gaps through BUILD_PROTOCOL before dispatch.

## Prepare once in 010

Inspect the completed baseline before choosing exact imports. Extract existing behavior without altering guards, IDs, facts, rewards, camera defaults or voice defaults during preparation. Establish these module seams with compiling neutral defaults and mount them once:

| Seam | Planned path | Owner after 010 | Consumer |
|---|---|---|---|
| Generic character model and paper materials | apps/web/src/world/characters/CharacterModel.tsx, materials.ts | 011 | World renderer/preview |
| Environment geometry and diegetic signage | apps/web/src/world/environment/Environment.tsx | 012 | Shared scene |
| Shared scene and pre-session preview | apps/web/src/world/WorldPreview.tsx, Scene.tsx | 012 | App |
| Movement/camera/proximity | apps/web/src/world/WorldRenderer.tsx, navigation.ts | 012 | App and voice focus |
| Onboarding and contextual HUD | apps/web/src/ui/**, app/**, app/game.css | 013 | Same world |
| Voice facade and device lifecycle | apps/web/src/audio/VoiceExperience.tsx, audio/** | 014 | App |
| Camera/status facade | apps/web/src/sensing/SensingExperience.tsx, sensing/** | 014 | Onboarding/settings |
| Encounter/sensing routes | apps/server/src/routes/encounters.ts, sensing.ts | 014 | Versioned session client |
| Presage provider/isolated process | apps/server/src/providers/presage/** | 014 | Sensing routes |
| Topic recommendation policy | packages/shared/src/engine/practice-topics.ts, content/practice-variants.ts | 014 | Pre-wired engine hooks |

010 owns startup, package files, shared schemas, barrel exports and the first integration imports. 011–014 cannot edit these common seams. 013 owns frontend app wiring after 010; 014 exports working facades without requiring edits to App/session-client. 012 alone places characters; 011 never edits WorldRenderer. Environment code never imports private voice modules; presentation components never mutate the engine. Freeze exact exported types and sample props in 010's completion evidence before dispatch.

## Shared planning contracts

All are shared exported types with Zod schemas where they cross HTTP. Defaults preserve baseline 1.2 inputs. Names below are implementation requirements, not permission to copy private types.

- CharacterModel props: role (player or existing NpcId), presentation (idle/greeting/listening/speaking), facing and palette. Character geometry is centered at ground origin; target height ~1.7 units. Collision lives elsewhere. Material tokens cover paper/light/shadow/accent colors and texture budgets.
- Scene view: a small presentation projection containing manifest geometry, visible interactables and character presentation. WorldPreview consumes this projection without fake PublicState/session IDs, quest progression or provider calls. Active WorldRenderer retains state/onAction/onTalk and gains optional onNpcProximity.
- ProximitySnapshot: npcId or null, distance or null, stable selection and current encounter generation. Notify only after position sync succeeds; no callbacks per frame. Missing callback retains baseline E behavior. UI may show the bubble; only the server's actual proximity/attempt guard allows a turn.
- VoiceExperience props: authoritative state, onAction, onSubmit compatible with useSession.submit, focused NPC, encounter generation, mic enabled, review-before-send and onStatus. Status is local idle/listening/transcribing/thinking/speaking/error. Neutral implementation delegates existing recorder/playback; 014 upgrades it. The same queue handles PA/NPC/greeting.
- SensingExperience props: authoritative session/attempt binding, explicit camera opt-in and onAvailability. It owns camera acquisition/teardown; camera test preview alone forwards no frames. Shared DeviceControls delegates tests and capture lifecycle so 013 never edits audio/sensing implementation.
- Optional TurnRequest.deliveryContextId references a server-created, unexpired current-attempt DeliveryContext record. No arbitrary client expression/confidence score in turn input. Absence means neutral. The server adds advisory style to DialogueProvider context, not evaluation/score/intent.
- DeliveryContext: source live/fixture/disabled, status unavailable/warming/ready, timestamp/expiry, quality and style neutral/upbeat/reassuring/calm. Optional local expression distribution is strictly allowlisted and quality-gated. Only a minimal style summary goes to Gemini; no raw video, landmarks, vitals, diagnosis or stable identity. Expiry ≤3 seconds. Values never enter PublicState or independent skill evidence.
- PracticeRecommendation: allowlisted topic drink-vocabulary/price-numerals/platform-directions/ticket-details/clarification, rationale from existing semantic/repair evidence, presentation support standard/gentle. Selection happens at mission start; initial tier semantics and boss tier stay unchanged.

010 determines the smallest compatible turn-response/debrief additions needed for these fields. It supplies fixtures for absent/neutral context and invalid/expired references, proves 1.2 fixtures still parse, then freezes exports. 014 cannot expand the schema behind consumers' backs.

## Route deltas prepared by 010 and implemented by 014

Retain existing /sessions, /state, /actions, /turns, /transcribe, /speech and /cue-playback APIs. No gameplay websocket rewrite.

- POST /api/sessions/:id/encounters: requestId, expectedVersion, npcId and encounter generation. Server derives current attempt/position and rechecks range/availability. Returns state plus optional speechId/operationId for one authored greeting. Deduplicate, issue at most one automatic greeting job per NPC/attempt and enforce 30-second encounter cooldown. Re-entry/replay cannot register a fresh boss pause. Never grant rewards/evidence. Ready speech follows existing speech-job lifecycle; no reusable arbitrary pause ID.
- POST /api/sessions/:id/sensing/consent: enabled boolean and an opaque server-issued consent capability bound to the current attempt. The browser must not invent an internal attemptId. Disabled clears frame buffers/context and stops the sidecar session. Record consent ephemerally; require before accepting a frame.
- POST /api/sessions/:id/sensing/frames: bounded binary/frame payload with validated dimensions, encoding and capture ordering under consent. Exact limits follow installed SDK capabilities and are frozen during 010 feasibility review. One latest frame pending, processing outside session locks, no disk persistence. Reject cross-origin/unbound/stale frames. Unknown/disabled provider returns neutral availability, not fabricated metrics.
- GET /api/sessions/:id/sensing/context: minimal availability and current context ID, never raw metrics/frames. Poll at ≤2 Hz; updates do not increment quest state or pause timers.

Keep Express same-origin access and request bounds. Camera control may need a separate short-lived session-bound capability from 010; do not expose the native process directly to the internet. CORS/open ports are not a shortcut. Server checks ordering/attempt; client clocks are advisory, server receipt determines expiry. Native process owns its API key server-side and is disabled by default.

## Feasibility and dependency freeze

At 010, verify available reference files and actual Presage SDK/package/platform (no live sensing without camera approval). Pin required SDK/native sidecar dependencies only if the platform spike works; otherwise freeze the disabled adapter and record a live-sensing blocker. Do not install Electron/Redis to satisfy a browser import. New VAD uses Web Audio initially, no library needed. Native Presage imports must stay out of Vite and normal CI startup. Decide build/bundling externalization for the optional package in 010.

Root dependencies are owned by 010, then 015. During the four lanes, proposals go into each owner's proposal file; wait for a small coordinated owner change instead of racing the lockfile. Integration tests live under apps/web/tests/overhaul/<segment>/ and apps/server/tests/overhaul/<segment>/, shared tests under packages/shared/tests/overhaul/<segment>/. Existing Playwright/Vitest discovery already includes these; tests/e2e at repository root is not currently discovered.

## Parallel merge rules

All four lanes branch from merged 010 and keep their own claims/completion/proposal records. Tests/assets/reports are category-specific. Imports use the mounted neutral contract; another lane's absence is not a reason to edit its files. Existing baseline tests remain active. 015 repairs only proven cross-lane defects after all four merges and updates the demo documents. No claims, stub code or completion records are created by this planning update.
