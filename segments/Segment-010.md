# Segment-010: Shanghai city streaming and exploration quests

Spec version 2.0 · Suggested owner A (integration) with parallel agents · Invocation: **Build Segment-010**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation. Spec 2.0 replaces the station campaign (P1/P2/B1) with three exploration quests — buy a drink, ask for directions to 上海大酒店, and get a photo taken at 黄浦江 — in a Shanghai-style city streamed in 40 × 40 chunks as the player walks. Microphone input → ElevenLabs STT → AI interpretation/dialogue → ElevenLabs NPC speech remains required core functionality, with typed/subtitle accessibility in the same world. Deterministic code owns facts, routes, landmarks, purchases, photos, and completion; Claude may only compose neighborhoods from an approved, versioned component catalog behind a feature flag, and a seeded fallback generator always works. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 1, 3, 7, 10, 13, 17, [docs/CITY_GENERATION.md](../docs/CITY_GENERATION.md), [docs/NEW_QUESTS.md](../docs/NEW_QUESTS.md), and the frozen [proposal](../proposals/city-streaming-contracts.md). Inspect `packages/shared/src/contracts.ts` and `packages/shared/src/city/contracts.ts` (frozen; integrator-only edits) and the current implementation/tests.

## Dependencies

[Segment-007](Segment-007.md)

The 1.2 integrated campaign is the starting point; its station content is migrated, not extended. A 1.2 completion record does not satisfy 2.0 acceptance.

## Writable scope

- `packages/shared/**` (contracts by the integrator only)
- `apps/server/**`
- `apps/web/**`
- `tests/e2e/**`
- `docs/**`, `proposals/city-streaming-contracts.md`, `IMPLEMENTATION_SPEC.md`, `AGENTS.md` (invariants), `README.md`, `SEGMENT_REGISTRY.md`, `segment-registry.json`

File ownership inside this scope is assigned per agent in the proposal's ownership table. Interface changes go through the integrator as contract change requests.

## Build steps

1. Update the campaign specification from NEW_QUESTS and freeze chunk, movement, interaction, and photo contracts (done in the proposal and contract files).
2. Build the reusable component library first: ≥60 distinct approved catalog entries across buildings, storefront modules, street infrastructure, landscaping, waterfront, and interaction anchors, each with metadata, matching R3F components, and gallery review at `/__gallery`.
3. Implement the seeded regional planner (districts, avenues, Huangpu corridor, creeks, hotel reservation, shared connectors), seeded fallback generator, manifest hashing/validation/repair, collision, world view, and verified hotel directions.
4. Rewrite the engine and content for Q1–Q3 against the `WorldView` seam: drink purchase with money, verified route delivery, photo request → countdown → capture acknowledgment.
5. Add the server world service, chunk routes, restore validation, generation scheduler (dedupe, concurrency 2, 8 s deadline, one retry, caps, fallback, logs), and the Claude city provider behind `ENABLE_CLAUDE_CITY`.
6. Stream chunks in the client with IndexedDB persistence of the spawn box, direction-prioritized prefetch, urgent fallback, mesh unloading, instancing/LOD, and the photo capture overlay; adapt dialogue/voice/UI to NPC roles and anchors.
7. Enable quest bias (≤1.5× after absence, reset on encounter) and polish; replace old campaign tests with the three quest journeys.

## Acceptance criteria

- Library: ≥60 approved entries spanning every category, each rendering in the gallery with valid collision metadata; common objects have meaningful variants; representative 3 × 3 fixture neighborhoods meet documented rendering budgets.
- Claude and fallback manifests use only catalog assets and allowed params; unknown IDs and incompatible attachments are rejected; catalog versions are recorded with cached manifests.
- Chunk boundaries have no seams or blocked routes; revisits preserve layouts; returning to spawn or reloading the same world makes zero spawn-generation calls and restores identical terrain without resetting quest state; generation order cannot alter shared connectors.
- Relevant-feature frequency rises modestly after prolonged absence; late/error responses never interrupt play; eligible opportunities for all quests exist within the exploration budget even when Claude fails.
- All three spoken quest journeys and their typed/subtitle alternatives pass with fixture providers: unavailable drinks, insufficient funds, ambiguous requests, truthful hotel routes, repeated interactions, unreachable placements, missing photo NPCs, failed captures, and revisits after chunk unloading. Quest completion requires the defined interaction and world action.
- Live voice and a live Claude generation smoke test are reported separately from fixture results; the voice loop remains required core functionality.

Run the repository-wide typecheck, lint, unit/API tests, production build, and browser journeys before commit.

## Exclusions

No extra language, multiplayer, authentication, procedural quests, generated code or asset URLs, geographic-accuracy claims, continuous voice, or pronunciation grading. Do not represent fixture generation as live Claude behavior.

## Deliver and merge

Build on `feat/shanghai-city-streaming`, open `[Segment-010] Shanghai city streaming and exploration quests` when the human authorizes commits and pushes, include behavior and actual validation evidence, and merge normally when green. Report fixture vs live results and remaining limitations honestly; never invent a successful merge.
