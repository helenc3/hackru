# Local launch and checks

Use Node **24.19.0**, npm **12.2.0**, Python **3.10+**, and a current desktop browser with WebGL. The repository pins Node in `.nvmrc` and `.node-version`, exact package versions in the workspace manifests, and one npm lockfile. npm 12's install-script allowlist approves only the required esbuild and protobufjs scripts.

```sh
nvm install
nvm use
npm install --global npm@12.2.0
npm ci
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`. The development API runs at port 3001; keep `PORT=3001` for the Vite proxy. The root `npm run dev` waits for API health before starting Vite, with a 30-second startup timeout. Both processes stop together. Vite reads the root `.env`; only `VITE_` names reach the browser. Never prefix a secret with `VITE_`.

Without keys the game still starts: fixture sessions (with `ENABLE_DEMO_FIXTURES=true`) play the full campaign with scripted, clearly labelled replies, and live sessions report a retryable provider outage without committing the turn. With `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` set, the player loop is microphone → ElevenLabs STT → transcript confirmation → Gemini → ElevenLabs reply speech. With `ANTHROPIC_API_KEY` also set, the text dialogue evaluation runs on Claude (`ANTHROPIC_MODEL`) instead of Gemini; the real-time voice relay stays on Gemini Live. `/api/health` reports `dialogue`/`speech` as `live` when a key is present; that means configured, not that a provider was contacted.

## Production preview

```sh
npm run build
PORT=4173 npm run start
```

Open `http://127.0.0.1:4173`. Express serves the built web app and `/api` from one origin, with no paid service dependency. The explicit port overrides the local `.env`. The listener binds to `127.0.0.1` by default.

### Hosting

A host runs the same single-origin server: `npm ci && npm run build`, then `NODE_ENV=production HOST=0.0.0.0 PORT=<port> node apps/server/dist/index.js` with the provider keys in the host's secret environment (never in a `VITE_` variable). Sessions are in memory; a restart expires them and the UI offers a fresh start. The validation harness is always disabled in production.

## Required validation

```sh
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npx playwright install firefox
npm run test:e2e
```

On a Linux machine, use `npx playwright install --with-deps firefox` to install the browser's system dependencies. The browser test starts and stops its own production server on port 4173; stop a manually running preview on that port first. Build before running browser tests. `test:e2e` also runs `tests/e2e`, which drives the real production server (no scripted API) through the world and compares mission state with the developer-harness path; it uses ports 4174/4175 (`E2E_PORT` moves them). Unit/API tests use fixtures and injected services; CI never requires paid API credentials. `quality` runs every required stage for pull requests and main.

`npm run check:kit` checks packet links and segment dependencies only; it is not a substitute for the application checks. Browser failure traces are written to ignored `test-results/`.

## Live provider acceptance (manual, paid)

CI never calls paid providers. With keys in `.env`, start a development server with the harness enabled and run the scripted spoken loop (10 turns of synthesized Mandarin through STT → Gemini → TTS, timings printed):

```sh
ENABLE_VALIDATION_HARNESS=true NODE_ENV=development PORT=3101 node --env-file=.env apps/server/dist/index.js
npx tsx --env-file=.env tests/e2e/live-acceptance.ts http://127.0.0.1:3101
```

This measures provider latency; it does not replace a human microphone check in the world. Results are recorded in `docs/INTEGRATION_REPORT.md`.

## Internal text validation

The text harness is a developer tool for the same engine, not a player game mode. To expose it locally, set both `ENABLE_VALIDATION_HARNESS=true` and `VITE_ENABLE_VALIDATION_HARNESS=true` in `.env`, then restart development. Fixture sessions additionally require `ENABLE_DEMO_FIXTURES=true`. Production always blocks the validation route, and its bundle has no text-mode selector even if these flags are set.
