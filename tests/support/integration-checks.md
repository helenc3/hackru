# Upstream integration checks

Measured 2026-10-11 against upstream main `2a4a38a4c283b7aa50a19b8086669335dadde50f`, Chromium software rendering, one worker. Durations include command startup; they are not CPU/GPU profiles.

| Check | Elapsed | Result |
| --- | ---: | --- |
| Typecheck | 5.9 s | Passed |
| Lint | 2.2 s | Passed |
| Unit/API and kit validator | 6.2 s | 299 tests in 41 files passed; validator passed |
| Build | 3.1 s | Passed |
| Complete browser suite | 318.1 s | 63 passed, 2 failed |
| Complete real-server journeys | 103.5 s | 11 passed |
| Single validation retry | 9.2 s | 1 passed; test itself 6.5 s |

The full browser failures were the gallery rendering budget and `rapid developer relocations dispatch serially with fresh versions`. Only the latter case was retried with an explicit file and title grep; it passed. The initial timeout remains recorded as intermittent. The full-quality gallery reported 548 draw calls against the 400-call limit, with 69,698 triangles below the 120,000 limit. Its coverage and budgets remain enabled.

| Journey case | Test duration |
| --- | ---: |
| Three-quest player campaign, photo and resumed terrain | 57.0 s |
| Server restart recovery | 10.6 s |
| Audio failure recovery | 9.6 s |
| Live-provider movement recovery | 8.7 s |
| Stale-version recovery | 6.9 s |
| Developer harness campaign | 6.3 s |

No before-change benchmark was collected. Full-quality world/gallery checks retain normal rendering; other browser checks use the lightweight profile. Fixture journeys use four-times movement with server validation and collision checks intact.

## Merge blockers

Standard `npm ci` fails with EBADENGINE: upstream `cedict-json@1.3.20251213` requires Node 22 while the repository uses Node 24 and engine-strict. Checks above used a diagnostic installation with `npm ci --engine-strict=false`; repository policy was not changed, and this does not prove a clean CI install.

Remote `build/merge-lock` remains owned by helenc3 at `ce43f1b91b27becc5aec0df04b312709d09a220c`. BUILD_PROTOCOL.md requires an explicit handoff before removing another account's lock. This branch is unmerged pending green checks and authorized lock acquisition. Microphone clock changes remain deferred until this commit is merged, as requested.
