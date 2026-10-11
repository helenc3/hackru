# Playwright rendering and movement profile

Playwright injects an explicit browser-only profile before application scripts. Lightweight tests use DPR 0.5, no antialiasing or toon outlines, and reduced decorative motion. World rendering and gallery specs retain full quality and normal speed, including demo-laptop FPS acceptance.

Journey tests request 4× movement. `applyAction` gains an optional fifth argument (`1 | 4`, default 1) for speed validation. The server selects 4 only when both ENABLE_DEMO_FIXTURES and E2E_FAST_MOVEMENT are enabled and the session uses fixture providers. Client requests cannot select server speed. Collision, committed-chunk checks, progression and rewards remain deterministic and unchanged. Normal movement tests retain authored speed coverage.

Journeys use the upstream compass and its collision-safe click-to-walk legs; no extra keyboard driver interface is needed.
