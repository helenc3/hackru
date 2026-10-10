# Frozen seams for parallel builds

Contract version: 1.2. The TypeScript shapes in specification section 7 are the starting point; Segment-000 implements their exported types and Zod schemas. Once 000 merges, later segments import those exports and their fixtures. The shared contract is changed only through its owner and an explicit compatible proposal. Do not duplicate it in a frontend or provider package.

## Module entry points established by 000

| Module | Initial export / interface | Implementing segment |
|---|---|---|
| `packages/shared/src/contracts.ts` | All section-7 types, matching schemas, internal state/content schemas | 000 |
| `packages/shared/src/content/index.ts` | `missions`, `npcs`, `sceneManifest`, `cues` | 001 (scene manifest 000) |
| `packages/shared/src/content/scene-manifest.ts` | Fixed locations, bounds, colliders, interactable IDs | 000; visual interpretation by 004 |
| `packages/shared/src/engine/index.ts` | `createGame`, `applyAction`, `applyEvaluation`, `projectPublicState` | 001, then 006 extends skill updates |
| `apps/server/src/providers/dialogue.ts` | `createDialogueProvider(config): DialogueProvider` | 002 |
| `apps/server/src/providers/speech.ts` | `createSpeechProvider(config): SpeechProvider` | 005 |
| `apps/server/src/routes/game.ts` | `createGameRouter(services)` | 001 |
| `apps/server/src/routes/audio.ts` | `createAudioRouter(services)` | 005; 009 may refine pacing |
| `apps/web/src/app/session-client.ts` | `createSession`, `getState`, `act`, `sendTurn`, event subscription | 003 |
| `apps/web/src/validation/ValidationHarness.tsx` | `ValidationHarness({state, onAction, onTalk})` | 003 |
| `apps/web/src/world/WorldRenderer.tsx` | `WorldRenderer({state, onAction, onTalk})` | 004 |
| `apps/web/src/audio/AudioController.tsx` | Session-linked speech/PA queue component | 005 |
| `apps/web/src/ui/SkillDebrief.tsx` | Evidence summary and next-practice explanation | 006 |
| `apps/web/src/audio/Recorder.tsx` | Required recording/transcript confirmation | 005 |

000 mounts game and audio routers and placeholder modules so later owners never edit server startup together. It also establishes a minimal app shell with one production world slot, development-only validation entry, and voice/debrief slots. 003 owns the shell after bootstrap; 004 edits world only; 005 owns recording, transcription, and playback audio modules; 006 edits its isolated debrief component plus engine skill module. Inject provider factories and session services so game routes do not import private audio implementations.

Placeholder modules are explicit, visibly unimplemented states and are not completion evidence for their segments. 000 preinstalls all core dependencies, including provider SDK, Express, Zod, R3F, Three, Vitest, and Playwright; required STT uses the existing HTTP client and browser APIs.

## Engine contracts

`createGame(options, nowMs)` returns internal state. `applyAction(state, action, nowMs)` and `applyEvaluation(state, npcId, evaluation, nowMs)` return `{ state, events }` without network calls. `projectPublicState(state, nowMs)` removes secret facts and boss feedback. Inject timestamps into engine calls so fake-clock tests are deterministic. The server owns version increments, request idempotency, locks, and provider wait pause reasons.

Internal state includes mission attempt ID, node ID, flags, item balances, awarded reward IDs, cue playback records, NPC mood/patience/history, independent/assisted evidence records, skill tracks, difficulty, timer pause reasons, freeze allowance, and evidence modality. Skill evidence and secret route facts never appear in raw active-boss public state.

Content schema is a declarative graph: mission `id/mode/startNode/nodes/reward`; node `id/objective/actionTransitions/intentTransitions`; transition `trigger/requiredFlags/setFlags/nextNode/result`; result `none/clear/fail`. Branch guards are data with bounded known operators, not evaluated strings. Runtime loading validates references and terminal reachability. 000 defines these schemas; 001 supplies content and transitions.

## Canonical IDs and intents

Mission IDs: `P1`, `P2`, `B1`. Zone IDs: `plaza`, `cafe`, `kiosk`, `concourse`, `platform-1`, `platform-2`, `platform-3`. NPC IDs: `xiaolin`, `achen`, `laozhou`. Required cue IDs: `p1.entrance-sign`, `p2.timetable`, `p2.platform-change`, `b1.destination-board`, `b1.harbor-change`.

| Intent | Valid slots | Engine meaning |
|---|---|---|
| `order_drink` | `drink=coffee\|tea\|water` | Coffee elicits unavailable response; available confirmed selection enables payment |
| `accept_substitute` | `drink=tea\|water` | Set available selection after unavailable coffee |
| `cancel_order` | none | Enable kiosk branch; no completion |
| `ask_direction` | `destination=jiangbin\|haigang\|airport` | Reply from active fact snapshot; never alone completes boarding |
| `confirm_platform` | `platform=1\|2\|3` | Acknowledge/correct from facts; records branch/assistance |
| `request_repeat` | none | Repeat most recent NPC cue in Mandarin |
| `buy_ticket` | `destination=haigang`, optional `quantity=1` | After recognized destination and needed detail, enables payment |
| `confirm_ticket` | `destination=haigang`, `quantity=1` | Resolve agent's ticket clarification |
| `greeting` / `unknown` | none | Dialogue only; no prerequisite flag |

Only scene-relevant intents and slots are sent to the model. Explicit choices include café/kiosk payment, cancel branch, platform boarding, and mission start/retry. 000 supplies an enum/fixture with all canonical action IDs; 001 binds its state guards. Inspection alone shows a sign but does not certify comprehension; a subsequent route decision supplies reading evidence. PA completion alone does not certify listening.

Canonical choice IDs: `p1.enter-plaza-door`, `p1.try-closed-door`, `p1.pay-cafe`, `p1.go-kiosk`, `p1.pay-kiosk`, `p2.board-1`, `p2.board-2`, `p2.board-3`, `b1.pay-ticket`, `b1.board-1`, `b1.board-2`, `b1.board-3`. All are state guarded; no choice directly sets a completion flag. NPC interactions can enable payment only after valid evaluated order/ticket details. Movement among authored zones is otherwise free.

The kiosk is self-service. After `cancel_order`, a fresh available-drink order and price confirmation to Xiaolin at the café enable the kiosk branch; Xiaolin gives the spoken directions before departure. Kiosk payment also requires kiosk proximity. Reusing the cancelled selection cannot pass. Do not add or relocate an NPC for this branch.

## Scene coordinates

World bounds x/z from −20 to 20. Plaza spawn (0, 10); café entrance (−10, 6), 小林 (Xiaolin) (−10, 4); kiosk (8, 5); concourse (0, 0), 阿陈 (Achen) (−3, 0), 老周 (Lao Zhou) (3, 0); platforms 1/2/3 at x=−10/0/10, z=−12. Movement speed 4 units/sec. Interaction radius 2. Flat walkable corridors connect every zone; walls cannot seal a required route. Scene coordinates are shared with validation locations and server zone checks. D may dress the scene without changing IDs or authoritative geometry.

## Fixture baseline

000 supplies one `PublicState` per mission, a sample action request/response, practice and boss turn responses, server-issued transcription record, valid evaluation, malformed evaluation, and a shared world/validation props interface. Later segments add their own fixtures under owned paths. Boss sample response already omits coach/vibe. All owners use this same fixture baseline.

For audio callbacks, use the specification's `audioPhase` action and its bounded lifecycle rules; no arbitrary client pause-reason string. 000 freezes its enums and schemas. 001 implements operation registration/bounds even while recording is a stub; 005 consumes that seam; optional 009 retains the same lifecycle contract. A playback operation is registered against a server-issued speech ID. A recording operation registers its unique ID on its initial phase, once per request; replaying that ID cannot renew phase bounds. Local recording controls enforce availability, while the server enforces one active operation and phase progression. This is a single-player integrity guard, not anti-cheat certification.

The shared renderer props are `{ state: PublicState, onAction: (action: GameAction) => Promise<void>, onTalk: (npcId: string) => void }`. `onTalk` opens the shared dialogue panel; only its Send calls the session client's `sendTurn`. World/validation callbacks never own provider calls. Production has no renderer toggle. The validator requires server `ENABLE_VALIDATION_HARNESS` and cannot grant real achievements. SkillDebrief consumes only `PublicState.debrief` after a terminal mission result.

## Mandarin and unified-experience additions (1.2)

NPC IDs are `xiaolin`, `achen`, `laozhou`. Canonical destination slot values are `jiangbin`, `haigang`, `airport`, with reviewed display/recognition aliases 江滨/江濱/Jiangbin/Riverside, 海港/Haigang/Harbor, 机场/機場/Airport. English-only destination input is a recognized concept but does not satisfy a Mandarin conversation gate. The model output field is `replyZh`. World text is Simplified Chinese; practice pinyin is an optional scaffold.

`playCue` now uses `channel: 'audio' | 'subtitles' | 'validation-text'`; remove the old game-edition field. `PublicState.validationMode` is server determined and `inputPreference` is voice or typed-accessibility. Active PA `visibleCues` exposes audio/label only unless subtitles are explicitly selected. The server never leaks the hidden PA transcript by populating an ordinary text field. One Station Navigator badge uses honest evidence metadata, not different game editions.

Create-session input preference defaults to voice; `setInputPreference` changes only the same-panel input affordance, never mission guards or hidden coaching. Internal validation sessions may simulate XP/items/badges to verify reward rules, but cannot resume as player sessions or transfer simulated progress. This preserves harness/world state comparisons without awarding actual player achievements.

Transcription returns text plus a session/attempt-bound ID. Turn input includes optional `transcriptionId` and source `typed | stt | stt-edited`; server derives the true source and rejects forged/unrelated IDs. Original STT and edited typed text are stored separately ephemerally. Only unchanged verified STT earns spoken evidence; edited/typed semantic success still follows the same quest rules.

Core acceptance requires reading cue → relevant spoken NPC exchange → world action, plus a live Mandarin STT/Gemini/TTS round trip. A callback or inspection alone never proves reading/listening. In P1, receipt plus arrival at station clears; P2 also requires the pre-update NPC direction exchange. Validation harness may simulate these events but cannot certify real voice behavior.


## Version 1.3 overhaul freeze

The 1.2 baseline remains compatible and historical packets stay intact. After verified 007/008/009, Segment-010 implements the additive preparation defined in [overhaul interfaces](docs/OVERHAUL_INTERFACES.md), extracts the character/environment/preview seams and mounts neutral voice/sensing consumers. Existing RendererProps callbacks, requests and fixture fields remain valid. Shared additions are optional/default-neutral and runtime-validated.

Only after 010 merges do 011–014 begin independently: characters, world/camera, interface, conversation/sensing. Root packages, shared schemas/barrel exports and server startup stay frozen for those lanes; 010 owns preparation and 015 owns final integration. No duplicated private types, concurrent lockfile edits or late cross-owner rewrites. Future sensing context is ephemeral, server/attempt-bound and cannot affect rewards/mastery or reveal boss help. No code/SDK/device work has been performed by this planning freeze.
