# Segment-004 integration proposal

The newly merged Segment-003 App.tsx already renders the inspected sign from
PublicState.visibleCues after the shared inspect callback. The renderer should
use that shared callback and let the app own the sign panel, rather than render
a second copy. The app sign panel currently has no Escape closure or automatic
focus/return-to-world handling.

Requested small ownership exception: apps/web/src/app/App.tsx only, adding a
ref and effect for the existing sign overlay. Focus its Close button when the
sign opens; close it on non-composing Escape; restore focus to the world. No
shared contract, mission/provider behavior, translated text, or asset changes.
The renderer's duplicate sign panel will be removed within Segment-004 scope.
The isolated fixture will supply the same shared sign callback behavior.

This change requires the requesting human to expand Segment-004's writable
scope, because the packet assigns App.tsx to Segment-003.

The requesting human approved the App.tsx ownership exception in this chat on 2026-10-10. Implemented the focus/Escape change without changing the frozen renderer interface.

## Local validation and handoff, 2026-10-10

The local branch contains the original claim and a normal merge of remote main
at `40d6dbea5605c6d86cb1d5032e8e005e4bc202be`. Segment-000's spec-1.2
dependency record and merged PR were verified before implementation.

- Typecheck and lint: pass.
- Unit/API suite: 33 tests pass; build-kit validator passes.
- Production build: pass; Vite reports the existing large JavaScript chunk
  warning (about 1.30 MB minified / 357 KB gzip).
- Entire fixture browser suite: 35 tests pass, successful process exit.
- Demo laptop: installed Chrome, Intel Arc 140T hardware WebGL; 1440×900
  viewport; three warm-up-following 2-second frame-count/time samples: 60 FPS
  each. Screenshot inspected for the visible capsule and Chinese landmarks.
- Owned tests exercise all manifest zones/targets, movement/collision/bounds,
  callback identity and deduplication, focus/Escape, failure retry, and both
  unsupported and lost WebGL recovery.

Windows sandbox adaptations stayed outside tracked source: Node 24.19/npm
12.2, a lockfile-derived dependency installation copied in place of blocked
workspace symlinks, compiled local shared-package exports for Playwright,
UTF-8 Python and workspace temp files, installed Chrome in place of blocked
browser extraction, and direct production-server lifecycle management to
avoid sandbox-blocked Windows `taskkill` teardown. No required assertion was
skipped or weakened. An unmodified clean `npm ci` and remote `quality` status
remain unverified here.

Publishing is blocked: before reconnect, GitHub writes returned 403 Resource
not accessible by integration; after reconnect, GitHub reads and writes both
return Unknown tool. Git CLI authentication also cannot run its Windows
helper in this sandbox. The remote claim, PR, completion record, CI and merge
remain pending. There is no authoritative Segment-004 completion on main.
The concrete local branch and validation evidence are preserved for handoff.

## PR #3 CI follow-up, 2026-10-10

The human published the original claim and branch and opened PR #3. Quality
run 38082405310 passed clean `npm ci`, typecheck, lint, unit/API tests and build.
Its browser failures came from keyboard movement overshooting interaction
targets during slow Playwright protocol round trips. Position telemetry now
reflects each rendered frame, and the owned walking helper releases keys in
the browser animation loop. The same callback, duplicate-dispatch and FPS
assertions remain intact. The revised full suite passes all 35 tests locally;
the nine owned tests also pass with SwiftShader software rendering, with
33/33.3/33.3 FPS samples. Hardware demo-laptop samples remain 60/60/60 FPS.

GitHub reads are restored, but connector code writes still return 403 Resource
not accessible by integration. The CI browser rerun on the fix and the normal
PR merge remain pending until the fix is published. The completion record is
pre-merge evidence and is authoritative only after a corresponding PR merge.

