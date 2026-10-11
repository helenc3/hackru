# World callback fixture

From the repository root, after installing the pinned dependencies:

```sh
npx vite fixtures/world --config fixtures/world/vite.config.ts
```

Click the world to focus it. WASD or arrows move the player relative to the
camera; drag with the left mouse button to turn; E invokes the nearest target
within the shared 2-unit range. The fixture city (`city.ts`) is a static 3 × 3
park with a creek and a level bridge, passed to `WorldRenderer` as `manifests`.
Append `?stream` to stream chunks from `/api` instead (tests mock the routes) to
exercise server-owned chunk streaming and reload. Delay and failure switches
exercise asynchronous callbacks. Sign and dialogue panels pause movement and
close with Escape.

This fixture records the frozen renderer callbacks. It does not implement the
mission engine, award progress, translate signs or call providers. It is never
imported or served by the production app.

```sh
npm run build
npm run test:e2e -- apps/web/tests/world
```

The owned tests cover camera-relative movement, normalized speed, water
collision, bridge crossing, uncommitted-chunk blocking, click-to-walk routing,
anchor callback IDs, interaction deduplication, focused-panel movement pause,
chunk streaming priority/batching/retry, server cache reuse after reload with zero
chunk regeneration, and unsupported/lost WebGL recovery. The performance case records three 2-second rendered-frame
windows after warm-up at a 1440×900 browser viewport and writes a screenshot
and GPU/FPS evidence into the ignored `test-results/` directory.

On the user-confirmed demo laptop, installed desktop Chrome with Intel Arc
140T hardware rendering produced 60, 60 and 60 FPS on 2026-10-10. This is local
fixture rendering evidence; it does not certify live voice/provider behavior.
