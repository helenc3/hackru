# Browser test profile

Import `test` and `expect` from `browser-test.ts` for Playwright tests. The context fixture injects the profile before scripts run, including on fixture-server origins and reloads. API-only tests do not create a browser context.

Default: DPR 0.5, antialiasing and toon outlines disabled, decorative motion reduced. World rendering and gallery specifications use `test.use({ renderProfile: 'full' })` to retain visual and hardware FPS coverage. Normal application sessions have no injected profile and keep full quality. Lightweight pages emulate reduced motion for CSS as well.

Real-server journeys use `test.use({ movementMultiplier: 8 })`. Their server config enables `E2E_FAST_MOVEMENT` and `ENABLE_DEMO_FIXTURES`; faster server movement is restricted to fixture sessions. Both keyboard movement and click-to-walk use the multiplier. Journeys use the upstream compass and its collision-safe click-to-walk legs. Live-provider sessions retain normal speed. Collision substeps, chunk readiness, interactions, photo capture and rewards remain active.

Run world tests with `--workers=1` to avoid competing software-rendering workloads. For diagnostic timing reports:

```sh
VITEST_JSON_OUTPUT=/tmp/vibequest-unit.json npm test
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/vibequest-browser.json npx playwright test --workers=1 --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/vibequest-journeys.json npx playwright test -c tests/e2e/playwright.config.ts --workers=1 --reporter=list,json
```

Journey reports contain named steps for waiting for streamed chunks and walking routes (including chunk prefetch and path planning). Their durations are subsets of test durations, not additional elapsed time. Reports are local fixture measurements, not live-provider or demo-hardware acceptance.

## Consolidated suites

Playwright runs 32 browser tests and 5 real-server journeys (previously 65 and 11). Pure camera, navigation, streaming, wayfinding and session-client contracts live in adjacent `.test.ts` files and run under Vitest; Playwright only collects `.spec.ts`. All 16 migrated test bodies remain.

Reuse is scoped to coherent scenarios: interaction/focus/detached-canvas/payment share one fixture world; dictionary lookup/review share one world; IME/feedback/preview share one app session; stale-version and audio-failure recovery share one real fixture session and vendor visit. Context-loss and incompatible audio mocks remain isolated. API contract scenarios are named steps in one real-server test; independent API sessions remain separate because their quest states differ.

Removed overlapping browser cases: the shell start smoke, standalone goodbye, duplicate payment journey, scripted photo countdown, duplicate provider/stale recovery, duplicate microphone denial, the restart-control smoke, and repeated keyboard creek crossing. Retained coverage includes the real full campaign/reload, world interaction callbacks, unit collision checks, audio recording/lifecycle/interruption, real recovery, production boundaries, and all validation contract scenarios. Pause & Learn, NPC preview, IME isolation and detached-canvas assertions moved into retained scenarios. Full-quality rendering budgets and FPS evidence remain enabled.

Microphone diagnostics use the Playwright clock after observing recording state instead of spending five real seconds per case. No failed rendering check was removed or its threshold changed.

Final speed changes: navigation/reload waits for DOMContentLoaded and then app readiness; the glossary reload resumes directly instead of loading twice. Fixture walking uses 8x speed with shorter route replanning delays. Callback-fixture world tests also use 8x movement. FPS windows are one second in injected profiles (three samples), while normal sessions remain at two seconds. Gallery budget checks wait for a fresh measured sample and assert the unchanged numeric limits immediately, rather than polling a known over-budget result for 15 seconds.

See [trim-timing-report.md](trim-timing-report.md) for measured timings and the explicit final no-rerun limitation.
