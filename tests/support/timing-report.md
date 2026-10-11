# Historical test timing report

These measurements preceded upstream integration (base `06e2220`). See [integration-checks.md](integration-checks.md) for current results.

Measured locally using Chromium/SwiftShader, fixture providers and one Playwright worker. These are elapsed test durations, not CPU/GPU profiling; no before-change benchmark was collected.

| Check | Elapsed | Result |
| --- | ---: | --- |
| Unit/API suite and kit validator | 5.5 s | 269 tests passed; validator passed |
| Complete browser suite | 245.4 s | 55 passed; full-quality gallery failed |
| Complete real-server journey suite, first run | 110.9 s | 9 passed; live movement and campaign routing failed |
| Typecheck | 5.3 s | Passed, including after fixes |
| Lint | 1.9 s | Passed, including after fixes |

The live-provider recovery case subsequently passed (8.9 s) after keeping live movement at normal speed. Five targeted navigation checks passed, including accelerated collision coverage. The final campaign rerun passed: all three quests, photo capture, and identical resumed terrain around the saved player position (52.5 s test duration; 56.0 s including startup). The complete suites were not repeated after these targeted corrections.

| Browser file/group | Sum of test durations | What it covers |
| --- | ---: | --- |
| UI and audio | 142.6 s | Repeated world setup, conversations, recording, recovery, UI interactions |
| Full-quality world | 33.5 s | Keyboard controls, bridge collisions, context loss, FPS samples |
| Developer validation UI | 25.6 s | Campaign and session validation flows |
| Full-quality gallery | 21.3 s | Catalog and neighborhood budget; includes a failed 15 s budget wait |
| Other browser tests | 16.5 s | Debrief, streamed reload, shell, transport and navigation |

The gallery reported 528 draw calls against a 400-call limit (67,498 triangles against a 120,000-triangle limit). Full-quality coverage and its budget remain enabled.

Further savings: two fake-device microphone checks each wait five real seconds and can use Playwright's clock. The slowest unit file is city fallback coverage (4.35 s), including a 100-seed vendor assembly check (3.13 s); optimize repeated catalog work rather than reduce seed coverage. Shared fixture-server startup and repeated UI world initialization are further profiling candidates. FPS sampling retains deliberate real-time waits for full-quality rendering coverage.

Final campaign timing steps (subsets of its 52.5 s):

| Phase | Elapsed |
| --- | ---: |
| world: wait for streamed chunks | 7.0 s |
| world: route walking and chunk prefetch | 23.6 s |
