# Browser test profile

Import `test` and `expect` from `browser-test.ts` for Playwright tests. The context fixture injects the profile before scripts run, including on fixture-server origins and reloads. API-only tests do not create a browser context.

Default: DPR 0.5, antialiasing and toon outlines disabled, decorative motion reduced. World rendering and gallery specifications use `test.use({ renderProfile: 'full' })` to retain visual and hardware FPS coverage. Normal application sessions have no injected profile and keep full quality.

Real-server journeys use `test.use({ movementMultiplier: 4 })`. Their server config enables `E2E_FAST_MOVEMENT` and `ENABLE_DEMO_FIXTURES`; faster server movement is restricted to fixture sessions. Both keyboard movement and click-to-walk use the multiplier. Journeys use the upstream compass and its collision-safe click-to-walk legs. Live-provider sessions retain normal speed. Collision substeps, chunk readiness, interactions, photo capture and rewards remain active.

Run world tests with `--workers=1` to avoid competing software-rendering workloads. For diagnostic timing reports:

```sh
VITEST_JSON_OUTPUT=/tmp/vibequest-unit.json npm test
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/vibequest-browser.json npx playwright test --workers=1 --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/vibequest-journeys.json npx playwright test -c tests/e2e/playwright.config.ts --workers=1 --reporter=list,json
```

Journey reports contain named steps for waiting for streamed chunks and walking routes (including chunk prefetch and path planning). Their durations are subsets of test durations, not additional elapsed time. Reports are local fixture measurements, not live-provider or demo-hardware acceptance.
