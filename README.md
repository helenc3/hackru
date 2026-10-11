# Speak Your Way

A single-player, desktop-browser game for practising Mandarin Chinese. You walk a third-person avatar through a Shanghai-style city that streams in chunks as you explore, read Simplified Chinese signs, and talk to NPCs by voice or typing. Three quests are offered in order: buy a drink from 老王, ask 小李 for directions to 上海大酒店, and get 小美 to take your photo at 黄浦江. AI models interpret your Mandarin and propose NPC dialogue or neighbourhood layouts; deterministic rules own every game fact, route, purchase, photo and reward.

Current behaviour is defined by the code and tests. [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md), [docs/NEW_QUESTS.md](docs/NEW_QUESTS.md), [docs/CITY_GENERATION.md](docs/CITY_GENERATION.md) and the [frozen streaming contracts](proposals/city-streaming-contracts.md) describe the design; where an older document disagrees with the code, the code wins. [AGENTS.md](AGENTS.md) lists the product invariants that must not change.

## Repository map

```text
apps/web/            React 19 + Vite + react-three-fiber client
  src/app/           App shell, session hook/client, global CSS
  src/world/         Player movement, camera, characters, wayfinding
  src/city/          Chunk streaming, chunk renderer, catalog asset components, /__gallery
  src/ui/            HUD, dialogue, coach, results panels
  src/audio/         Clip recorder, live-voice WebSocket client, playback, music
  src/dictionary/    CC-CEDICT gloss popover, lookup, review list
  src/validation/    Developer-only text harness (/__validation)
  tests/             Playwright specs against the scripted API tape
apps/server/         Express API + WebSocket live relay
  src/routes/        Sessions, actions, turns, audio, city chunks
  src/providers/     Claude / Gemini dialogue, ElevenLabs speech, fixtures
  src/live/          Relay between the browser and Gemini Live
  src/city/          World service and Claude city composer
  src/dictionary/    CC-CEDICT lookup route
  tests/             Vitest (supertest) API and provider tests
packages/shared/     Zod contracts, pure game engine, authored content, city planner/validator/fallback
fixtures/            Baseline JSON, scripted UI API, validation campaigns, standalone world preview
tests/e2e/           Real-server Playwright journeys; tests/support/ shared browser profile
scripts/             wait-for-api.js (used by npm run dev), generate-music.py
docs/                Launch guide, quests, city generation, approved voices, asset attribution
proposals/           Interface change records that amended the contracts
segments/, .build/   Historical Spec 1.2 build packets and completion records
audio_test/          Historical ElevenLabs voice comparison and latency experiments
```

`_prototype/` (untracked, gitignored) is the original hackathon prototype and is not used by the app. npm package names still use the pre-rename scope `@vibequest/{web,server,shared}`.

## Run it

Node 24.19 and npm 12.2 are pinned. See [docs/LOCAL_LAUNCH.md](docs/LOCAL_LAUNCH.md) for environment variables, ports, provider keys, the production preview and hosting.

```sh
npm ci
cp .env.example .env   # keys are optional; without them the game uses fixture replies
npm run dev            # API on 3001, web on http://127.0.0.1:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the API with tsx watch, wait for `/api/health`, then start Vite |
| `npm run typecheck` | `tsc --noEmit` for shared, server and web |
| `npm run lint` | ESLint (includes React hooks rules for `apps/web/src`) |
| `npm test` | Vitest unit/API tests, then `validate_kit.py` |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | Build shared, web (Vite) and server (tsup) |
| `npm start` | Serve the built app and API from one origin |
| `npm run test:e2e` | Playwright component suite, then the real-server `tests/e2e` suite |
| `npm run check:kit` | Validate the historical segment kit links and dependency graph |

While iterating, run only the specs that cover your change (`npx vitest run <file>`, `npx playwright test <file> --workers=1`); run the full suite before committing.

## Historical documents

The repository was built as numbered segments by a four-person team under a Spec 1.2 station campaign, then replaced by the Spec 2.0 streamed-city quests (Segment-010). [SEGMENT_REGISTRY.md](SEGMENT_REGISTRY.md), [BUILD_PROTOCOL.md](BUILD_PROTOCOL.md), [CONTRACT_FREEZE.md](CONTRACT_FREEZE.md), `segments/`, `.build/`, [docs/INTEGRATION_REPORT.md](docs/INTEGRATION_REPORT.md) and `audio_test/` are kept as that history; `python3 validate_kit.py` still checks their links.
