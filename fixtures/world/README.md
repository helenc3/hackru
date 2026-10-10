# World callback fixture

From the repository root, after installing the pinned dependencies:

```sh
npx vite fixtures/world --config fixtures/world/vite.config.ts
```

Click the district to focus it. WASD or arrows move the capsule relative to the
camera; drag with the left mouse button to turn; E invokes the nearest target
within the frozen 2-unit range. The mission selector loads the shared P1/P2/B1
state. Delay and failure switches exercise asynchronous callbacks and recovery.
Sign and dialogue panels pause movement and close with Escape.

This fixture records the frozen renderer callbacks. It does not implement the
mission engine, award progress, translate signs or call providers. It is never
imported or served by the production app.

```sh
npm run build
npm run test:e2e -- apps/web/tests/world
```

The owned tests cover camera-relative movement, normalized speed, collision and
wall sliding, bounds, reachability of every manifest zone and interactable,
shared callback IDs, interaction deduplication, focused-panel movement pause,
the shared app's sign-panel integration, callback retry, and unsupported/lost
WebGL recovery. The performance case records three 2-second rendered-frame
windows after warm-up at a 1440×900 browser viewport and writes a screenshot
and GPU/FPS evidence into the ignored `test-results/` directory.

On the user-confirmed demo laptop, installed desktop Chrome with Intel Arc
140T hardware rendering produced 60, 60 and 60 FPS on 2026-10-10. This is local
fixture rendering evidence; it does not certify live voice/provider behavior.
