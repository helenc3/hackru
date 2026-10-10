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

Segment-000 needs no API keys. Its interface shows a static Chinese district, health flags, and explicitly unfinished voice/debrief slots. Segment-001 implements session, action, and turn routes with fixture campaigns and guarded progression. Live dialogue, speech, and transcription providers remain owned by Segments 002/005 and return 501 from their scaffolds; the game API reports unavailable provider turns without committing them. A configured flag means a key is present, not that a provider was contacted. There is no playable movement or earned progress yet.

## Production preview

```sh
npm run build
PORT=4173 npm run start
```

Open `http://127.0.0.1:4173`. Express serves the built web app and `/api` from one origin, with no paid service dependency. The explicit port overrides the local `.env`. The listener binds to localhost for this local preview; deployment configuration belongs to Segment-007.

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

On a Linux machine, use `npx playwright install --with-deps firefox` to install the browser's system dependencies. The browser test starts and stops its own production server on port 4173; stop a manually running preview on that port first. Build before running browser tests. Unit/API tests use fixtures and injected services; CI never requires paid API credentials. `quality` runs every required stage for pull requests and main.

`npm run check:kit` checks packet links and segment dependencies only; it is not a substitute for the application checks. Browser failure traces are written to ignored `test-results/`.

## Internal text validation

The text harness is a developer tool for the same engine, not a player game mode. To expose its unfinished slot locally, set both `ENABLE_VALIDATION_HARNESS=true` and `VITE_ENABLE_VALIDATION_HARNESS=true` in `.env`, then restart development. Fixture sessions additionally require `ENABLE_DEMO_FIXTURES=true`. Production always blocks the validation route, and its bundle has no text-mode selector even if these flags are set.

## Next accounts

After Segment-000 is merged and verified, four separate accounts can run **Build Segment-001**, **Build Segment-002**, **Build Segment-003**, and **Build Segment-004** in parallel. Read root `AGENTS.md` first. Each packet defines its own paths, dependencies and acceptance criteria; use the remote claim protocol and preserve the shared contracts. The root package files and lockfile remain frozen until the integration owner coordinates a needed change.
