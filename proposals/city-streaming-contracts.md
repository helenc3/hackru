# Proposal: Shanghai city streaming + exploration quests (contract 2.0)

Status: **frozen for the parallel build** on branch `feat/shanghai-city-streaming`.
Sources: [docs/CITY_GENERATION.md](../docs/CITY_GENERATION.md), [docs/NEW_QUESTS.md](../docs/NEW_QUESTS.md).
Frozen code: `packages/shared/src/contracts.ts` (game 2.0) and `packages/shared/src/city/contracts.ts` (city).
Only the integrator edits those two files. Need a change? Put it in your final report under
"Contract change requests"; keep a local workaround in your own files meanwhile.

## Decisions

- Campaign: `Q1` buy a drink → `Q2` directions to 上海大酒店 → `Q3` photo at 黄浦江. All `mode: 'practice'`, untimed (`timer: null`), no boss, no freeze. `Q1` unlocks `Q2` unlocks `Q3`.
- NPC **roles** (`NpcIdSchema`): `vendor`, `guide`, `passerby`. Many anchor instances share a role; dialogue state (`npcState`) is per role, remembering the last `anchorId`. Turn requests carry `npcId` (role) and `anchorId` (instance). Approved voices: vendor = Coco Li `Ca5bKgudqKJzq8YRFoAz`, guide = James Gao `4VZIsMPtgggwNg7OXbPY`, passerby = Karo Yang `5mZxJZhSmJTjL7GoYfYI`. The vendor nearest spawn is named 老王 (see `characterDescriptions`).
- World coordinates: unbounded within ±10 000 (`WORLD_LIMIT`). `WORLD_RULES` keeps speed 4, interaction radius 2, player radius 0.35, flat movement.
- Zones are district kinds; the server derives `zoneId` from committed manifests. Action `move {position}` replaces `moveZone`.
- PA cues/listening of the station campaign are gone. Readable signs (`q1.menu`, `q2.hotel-sign`, `q3.river-sign`) are `kind:'sign'` anchors. (Superseded: sign inspection was removed in [remove-sign-interactions.md](remove-sign-interactions.md); signs are scenery.) Listening evidence now comes from spoken NPC replies only where the spec already allowed it (directions listened via audio, not subtitles).
- Money: `inventory.cny` starts at 20 (≥ one available drink). `q1.pay` at a vendor anchor deducts the confirmed price, adds the drink, appends a `PurchaseRecord`. Insufficient funds → `ACTION_FORBIDDEN`, no state change. Repeat purchases never re-grant the Q1 reward (`awardedRewardIds`).
- Q2 completes when a successful `ask_directions{destination:'grand-hotel'}` turn with a `guide` anchor produces a verified `Directions` from `WorldView.directionsToHotel` (server stores it in `state.directions`; the NPC reply is its `textZh`). The model's reply text never replaces it. `destination:'other'` → NPC says it doesn't know (authored line), no progress.
- Q3: successful `request_photo` with a `passerby` anchor within interaction radius, and a `river-viewpoint` anchor within 12 m of the passerby → server issues `PhotoRequest{status:'accepted', spot}` (spot = the viewpoint anchor's photo-spot position). Player walks to the spot (≤ `PHOTO_RULES.spotRadius`) and sends `choose{choiceId:'q3.start-photo', anchorId: viewpointAnchorId}` → status `countdown`, `countdownEndsAtMs = now + 3000`. Client runs the NPC countdown, captures the canvas framed on player + river, then sends `photoCapture{photoRequestId, outcome, imageDigest}`. Server accepts `captured` only if now ≥ countdownEndsAtMs, now ≤ countdownEndsAtMs + captureWindowMs, the player is still on the spot, and a digest is present → Q3 clear. `failed` → status back to `accepted`, attempts++ (retry, no duplicate reward). A screenshot/action without an accepted request is rejected.
- AI never completes quests: completion comes only from engine transitions on validated evaluations + world actions.

## Engine seam (packages/shared/src/engine)

All engine functions gain a trailing `world: WorldView` argument (from `city/contracts.ts`):

```ts
createGame(options: CreateGameOptions, nowMs): InternalState            // options.spawn, options.worldId
applyAction(state, action, nowMs, world): EngineResult
dialogueContext(state, npcId, anchorId, world): TurnContext
applyEvaluation(state, npcId, anchorId, evaluation, nowMs, world): EngineResult
groundedReply(state, npcId, evaluation, world): string
projectPublicState(state, nowMs, world): PublicState
synchronizeGame(state, nowMs): EngineResult
offTarget(evaluation): boolean
EngineRuleError, createFixtureDialogueProvider
```

`move`: rejected unless `world.walkable(position)` and speed rule (same slack as before). Updates `zoneId = world.districtAt`, exploration (`activeMs`, visited chunk keys) and encounters (anchors with quest capabilities within `BIAS_RULES.encounterRadius`).
`projectPublicState.interactables`: anchors within 60 m whose capability the current quest uses (any quest: npc anchors of the quest's roles, signs, the hotel landmark, viewpoints in Q3, the photo spot when a request exists), nearest first, max 40. `PublicInteractable.id` = anchor ID.

## City modules (packages/shared/src/city) — owners in the table below

```ts
// rng.ts
hashString(text): number                       // 32-bit FNV-1a
seedFromWorldId(worldId): string               // deterministic; restarting the server needs only the worldId
createRng(seed: string, ...salt: (string|number)[]): () => number   // mulberry32, [0,1)
// planner.ts
worldLayout(seed): { spawn: Position; hotel: { coord: ChunkCoord; anchorId: 'hotel.grand'; local: {x,z} }; river: { axis: 'x' | 'z'; center: number; width: number } }
planChunk(seed, coord): ChunkPlan               // district clusters, connectors (shared edges agree), planner water + avenues, required anchors
// fallback.ts
generateFallbackChunk(worldId, seed, coord, questContext: QuestContextSnapshot, plan?): ChunkManifest   // sealed; always passes validateManifest
// hash.ts (sync, pure JS sha256 — runs in browser and node)
sha256Hex(text): string; canonicalJson(value): string
sealManifest(m: Omit<ChunkManifest,'contentHash'>): ChunkManifest; verifyManifestHash(m): boolean
// validate.ts
deriveCollision(m: ChunkManifest): ChunkCollision      // world coords; from catalog footprint/collision + water + bridges
validateManifest(m, plan, opts?: { requireHash?: boolean }): { ok: true } | { ok: false; errors: string[] }
repairManifest(m, plan): ChunkManifest | null          // deterministic: drop offending optional placements, reseal
// world-view.ts
createWorldView(worldId, seed, manifests: ReadonlyMap<string, ChunkManifest>): WorldView
// directions.ts
routeToHotel(seed, manifests, fromAnchor: {id, position}): Directions | null
// bias.ts (engine owner)
questWeights(missionId, exploration): Record<QuestCategory, number>   // baseline 1, ramps to ≤1.5 after absence, normalized
recordEncounters(exploration, categories: QuestCategory[]): ExplorationState
```

Planner layout defaults (tunable): chunk 40 m; spawn box cx,cz ∈ [-1,1] is land (historic/shopping); the Huangpu River is a straight corridor `axis:'z'` at about x ≈ +150 (chunks cx = 3/4 boundary), 30 m wide with a waterfront promenade district on its west bank; creeks are narrower (6–10 m) and cross some chunks; avenues on a 2-chunk grid along chunk edges (offset 0/40 shared exactly); the hotel is reserved in one chunk 2–3 chunks from spawn on an avenue; spawn chunk (0,0) requires a `drink-vendor` (named 小林) and (0,0) or a neighbour a `direction-helper`; the riverside chunks within `EXPLORATION_BUDGET_CHUNKS` require a `river-viewpoint` + `photo-passerby` pair at least once.

## Catalog (≥ 60 approved entries)

Shared metadata `packages/shared/src/city/catalog/<file>.ts` exports `<name>Entries: readonly CatalogEntry[]`.
Web components `apps/web/src/city/assets/<file>.tsx` export `<name>Assets: Record<assetId, AssetComponent>` (props in `assets/types.ts`).
Same owner for both halves of a category. Reuse `apps/web/src/world/toon.tsx` (`Toon`, `candy`, `INK`) and extract/parameterize from `decor.tsx`/`characters.tsx` (import, don't move, existing exports; copy into your file if you must change them). Target counts per file and suggested IDs:

| File | Count | Suggested IDs |
| --- | --- | --- |
| buildings-residential | ≥ 9 | bld.lanehouse.row, bld.lanehouse.corner, bld.lanehouse.gate, bld.lanehouse.courtyard, bld.apartment.lowrise, bld.apartment.slab, bld.apartment.tower, bld.apartment.compound-gate, bld.residential.wall |
| buildings-commercial | ≥ 11 | bld.shop.twostory, bld.shop.corner, bld.cafe.small, bld.restaurant.dimsum, bld.restaurant.noodle, bld.market.hall, bld.office.glass, bld.office.podium, bld.office.tower, bld.warehouse.brick, bld.warehouse.shed |
| storefront | ≥ 10 | sf.door.wood, sf.door.glass, sf.window.shop, sf.window.lattice, sf.awning.striped, sf.awning.canopy, sf.counter.takeaway, sf.sign.vertical, sf.sign.horizontal, sf.sign.neon, sf.shutter.rolling, sf.lantern.pair |
| street | ≥ 12 | st.road.straight, st.road.intersection, st.crossing.zebra, st.sidewalk, st.lane.paved, st.metro.entrance, st.lamp.modern, st.lamp.lantern-post, st.bench, st.bollard, st.bikerack, st.sharedbikes, st.trashbin, st.busstop, st.streetsign, st.loading-bay |
| landscape | ≥ 9 | ls.tree.plane, ls.tree.camphor, ls.tree.willow, ls.tree.osmanthus, ls.shrub.round, ls.shrub.hedge, ls.planter.box, ls.park.lawn, ls.park.pavilion, ls.courtyard.tiles, ls.flowerbed, ls.rock.garden |
| waterfront | ≥ 8 | wf.riverbank.straight, wf.riverbank.corner, wf.promenade, wf.railing, wf.bridge.level, wf.canal.edge, wf.canal.steps, wf.pier.viewing, wf.boat.moored |
| anchors | ≥ 7 | an.vendor.cafe-counter, an.vendor.drink-stall, an.vendor.convenience, an.helper.info-board, an.hotel.grand, an.viewpoint.river, an.npc.figure (role param: vendor/guide/passerby), an.sign.menu |

Rules: each entry must be a useful distinct silhouette/configuration/role (no colour-only duplicates); common objects get variant params (`variant` enum etc.); signs use `text` params only; `review: 'approved'` only after it renders in the gallery with matching collision. Footprints in metres; Shanghai-scale density (lane houses ≈ 4–6 m frontage, apartments 12–20 m, towers ≤ 30 m tall at LOD 0). Keep triangle counts modest; `cost.instanced: true` for props that the renderer should instance (trees, lamps, bollards, bikes, benches).

Anchors: entries with capabilities are the only things an `Anchor` may bind to; `an.hotel.grand` is the only `hotel-landmark`. NPC figures render via `an.npc.figure` (role param) and reuse `Npc` from `world/characters.tsx`.

## Server (apps/server)

`ServerServices` gains `worlds: WorldService` (apps/server/src/city/world-service.ts):

```ts
interface WorldService {
  open(worldId?: string): WorldInfo                       // mint or reopen; worldId → seed via seedFromWorldId
  view(worldId: string): WorldView                         // over committed manifests
  request(sessionId, worldId, coords, urgent, questContext): Promise<ChunkResponse>
  restore(worldId, manifests): ChunkRestoreResponse        // validate + hash + plan compliance; existing commits win
}
```

Routes (apps/server/src/routes/city.ts): `GET /api/worlds/:worldId` → WorldInfo; `POST /api/sessions/:id/chunks`; `POST /api/sessions/:id/chunks/restore`. Session create (`routes/game.ts`) calls `worlds.open(body.worldId)` and stores `worldId` in state; spawn chunks are requested by the client (restore first). Movement into uncommitted chunks is rejected by `walkable`.

Generation: cache lookup first; dedupe in-flight by key; concurrency 2; 8 s deadline with one bounded retry inside it; per-session call/token caps; Claude only when `config.enableClaudeCity && anthropicApiKey && session not fixture`; otherwise / on timeout / refusal / invalid → `repairManifest` then `generateFallbackChunk`. Once committed a chunk never changes; late results are discarded. Spawn chunks are pinned. Logs: JSON lines with key, source, latencyMs, validation error codes, usage tokens — no prompts, no keys.

Claude city provider (apps/server/src/city/claude-city.ts): Anthropic SDK + structured outputs (`output_config.format json_schema`, reuse `strictSchema` from providers/claude/live.ts), system prompt includes verbatim: “Compose this neighborhood from the supplied reusable component library. Select approved asset IDs and vary only their documented parameters; reuse building kits and attachment sockets to create coherent streets. Do not invent components, geometry, materials, scripts, or asset URLs. If the catalog cannot express a desired feature, choose the nearest approved alternative and report the missing capability separately.” Inputs: coord, seed, plan (district, connectors, planner water/roads, required anchors), neighbour summaries, `catalogForPrompt`, quest weights. Output → placements/roads/anchors/missingCapabilities; the server adds planner-owned fields, seals and validates.

## Web (apps/web)

- `src/city/chunk-cache.ts` — (Superseded by [server-owned-city-layout.md](server-owned-city-layout.md): no IndexedDB; the browser keeps only `localStorage['vibequest.worldId']` and the server owns committed manifests.)
- `src/city/streamer.ts` — on chunk-boundary change: request missing chunks in the visible 3×3 + prefetch ring, travel-direction first, batches ≤ 6, ≤ 2 in flight; `urgent` when the player is within 8 m of an uncommitted visible chunk; unload meshes beyond radius 2 but keep manifests.
- `src/city/ChunkRenderer.tsx`, `src/city/CityScene.tsx` — render manifests via `ASSET_COMPONENTS`, instanced common props, distance LOD. Replace `world/District.tsx` usage.
- `src/world/navigation.ts` — collision/pathing from `createWorldView` over loaded manifests (client prediction mirrors server).
- `src/world/photo-capture.ts` — `registerCapture(fn)` / `capturePhoto(spot, viewpoint): Promise<{ digest: string; dataUrl: string }>`; the Canvas uses `preserveDrawingBuffer` only during capture or reads pixels in the render loop.
- `src/city/gallery/` — `/__gallery` dev page: every entry at params min/default/max, attachment combos, representative 3×3 street per district kit, collision overlay, draw-call/triangle readout.
- UI: quest panel for Q1–Q3, money/drinks inventory, directions card (steps zh + English), photo countdown overlay + result thumbnail, NPC role names, no boss UI.

## Ownership (wave 1)

| Agent | Owns |
| --- | --- |
| cat-res, cat-com, cat-sf, cat-st, cat-ls, cat-wf, cat-an | their `catalog/<file>.ts` + `assets/<file>.tsx` + `packages/shared/tests/city/catalog-<file>.test.ts` |
| planner | city/rng.ts, planner.ts, fallback.ts, tests/city/planner*.test.ts, fallback*.test.ts |
| validate | city/hash.ts, validate.ts, world-view.ts, directions.ts, tests/city/{hash,validate,world-view,directions}*.test.ts |
| engine | shared/src/engine/**, content/**, fixtures.ts, city/bias.ts, shared tests outside tests/city (rewrite old campaign tests) |
| server-city | apps/server/src/city/**, routes/city.ts, services.ts, app.ts, server tests/city/** |
| server-game | routes/game.ts, routes/audio.ts, session-store.ts, live/**, providers/** (dialogue prompts, fixture), errors.ts, index.ts; other server tests |
| web-stream | apps/web/src/world/**, src/city/{chunk-cache,streamer,ChunkRenderer,CityScene}.ts(x), tests/world/** |
| web-ui | src/app/**, src/ui/**, src/audio/**, src/validation/**, tests/ui/**, tests/audio/**, tests/validation/**, tests/skills/**, tests/shell.spec.ts |
| gallery | src/city/gallery/**, src/main.tsx, apps/web/tests/gallery/** |
| docs | IMPLEMENTATION_SPEC.md, AGENTS.md (invariants only), README.md, SEGMENT_REGISTRY.md, segments/Segment-010.md (new), docs/** except the two source specs, validate_kit.py if it checks those docs |
| integrator (main) | contracts.ts, city/contracts.ts, city/index.ts, catalog/index.ts, assets/index.ts, config.ts, tests/e2e/**, final integration |
