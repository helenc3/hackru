# Consolidated test timing report

Measured locally on 2026-10-11, Chromium software rendering, one Playwright worker, sequential suites. Playwright count fell from 76 to 37 (51.3%): browser 65 → 32, e2e 11 → 5. Sixteen pure TypeScript cases moved to Vitest with their assertions retained. Related scenarios reuse worlds; unrelated mock/device and context-loss scenarios remain isolated.

These measurements are from the consolidation run BEFORE the final speed edits. At the human's explicit request, no tests were rerun after the 8x movement, reduced-motion CSS, DOMContentLoaded navigation, single glossary reload, fast gallery assertions and one-second FPS windows. Final typecheck and lint passed before the final gallery sample-order adjustment and world-fixture movement option; final diff whitespace check passed. This report does not claim the final pushed revision has passing tests.

| Suite | Prior wall time | Consolidation wall time | Result |
| --- | ---: | ---: | --- |
| Unit/API + kit validator | 6.2 s | 6.91 s | 315 passed in 46 files; validator passed |
| Browser | 318.1 s | 232.89 s | 31 passed; gallery budget failed |
| E2E | 103.5 s | 89.96 s | 5 passed |

Prior browser run included both a validation timeout and gallery failure; the consolidated validation checks passed. Comparisons are single local runs, not controlled repeated benchmarks. Runtime is not proportional to test count: the full campaign and rendering checks still do substantive work.

| Individual test | Measured duration | Final optimization, unmeasured |
| --- | ---: | --- |
| Player three-quest campaign + world reload | 45.7 s | 8x fixture walking, faster route replanning/polling, DOM-ready navigation |
| Simulated validation campaign | 24.0 s | Reduced-motion CSS and DOM-ready navigation |
| Catalog + neighborhood rendering budget | 21.8 s (failed) | Assert fresh numeric budget immediately; retain 400-call/120,000-triangle limits |
| Shift-click glossary + saved review after reload | 14.6 s | Remove second reload and reduce CSS motion |
| Server restart recovery | 12.8 s | DOM-ready navigation; keep actual restart/session checks |
| Live AI outage recovery | 10.5 s | DOM-ready navigation and reduced CSS motion; live movement remains normal |
| Fixture stale-version + audio-failure recovery | 10.4 s | Reuse vendor/world, then increase fixture movement to 8x |
| Live voice/transcripts/interruption | 10.4 s | DOM-ready navigation and reduced CSS motion |
| Full-quality world FPS + controls | 10.1 s | Three one-second FPS windows, faster fixture walking, stop when movement target reached |

Both microphone diagnostics already use fake clocks for their five-second timers (2.4–2.5 s total per test in this run). Authored real-server photo countdowns still use real server time; no product timer or rendering budget was weakened. The FPS acceptance threshold remains 30 FPS on the confirmed demo laptop, with shorter sampling windows requested by the human.

Raw logs and JSON are in `/tmp/hackru-trim-{unit,browser,e2e}.{log,json}`; wall times in `/tmp/hackru-trim-timing.json`. Existing clean-install dependency and merge-lock blockers remain documented in [integration-checks.md](integration-checks.md).
