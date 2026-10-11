# Art Style Prompt: "Toon Spike × Powerpuff Girls × Genshin"

Restyle Speak Your Way's visuals with a new art direction: **"Toon Spike × Powerpuff Girls × Genshin."** This changes only how things look. Do not touch gameplay, the frozen contracts, `sceneManifest` colliders/positions, mission logic, or test IDs.

## Art direction

- **Toon Spike (Brawl Stars):** chunky, squash-and-stretch proportions; thick dark outlines (deep ink-purple `#2a1838`, not pure black); saturated candy colors; playful wobble and bounce on idle and interaction.
- **Powerpuff Girls:** big heads and tiny bodies on characters (head about 40–50% of height), oversized expressive eyes, stubby limbs, flat cel color with hard shadow edges, and bold geometric simplicity. Buildings get a tilted, slightly wonky, hand-drawn quality.
- **Anime / Genshin Impact:** soft two-tone cel shading with a gradient ramp. Add a rim light (warm on the lit side, cool lavender in shadow), a painterly gradient sky (peach → sky blue), gentle bloom on highlights and lanterns, and floating sparkle/petal particles in the plaza. NPCs should feel like a slightly more elegant anime version of the chibi base: hair tufts, accent colors, small accessories.
- **Setting:** keep it a modern Chinese city district (café, kiosk, station platforms). Add stylized touches like red lanterns, curved eave trims on the café, and cherry/osmanthus tree blobs. Every world text label stays in Simplified Chinese.

## Implementation constraints (this repo)

- The 3D world is in `apps/web/src/world/WorldRenderer.tsx` (react-three-fiber + drei). Replace `meshStandardMaterial` with `meshToonMaterial` and a 3-step `gradientMap` (a `DataTexture` with `NearestFilter`). Add outlines with drei's `<Outlines>` or inverted-hull meshes. **Add no new dependencies** unless bloom truly needs `@react-three/postprocessing`. If it does, ask first.
- Build characters (player and NPCs) from primitives: big sphere head, small capsule body, eye decals or flat planes, hair blobs. Give the player a distinct signature silhouette and color (e.g., a spiky hair crest as a nod to Spike). Add an idle bob and squash/stretch on movement in the existing `useFrame` loop.
- Keep walkable slabs and colliders at the same footprint. Only change color, material, outline, and non-colliding decoration.
- UI (`apps/web/src/app/game.css`, `styles.css`, `world/world.css`): chunky rounded panels, 3px ink outlines, offset drop shadows (sticker / Brawl Stars button feel), bouncy hover/press transforms, and a candy palette defined once as CSS variables. Landmark labels become pill-shaped nameplates. Keep text contrast WCAG AA and keep visible `:focus-visible` outlines.
- Respect `prefers-reduced-motion`: disable bobbing, sparkles, and UI bounce when it's set.
- Keep the WebGL fallback screen working, and restyle it to match.
- Keep the frame budget reasonable on a mid-range laptop: low-poly segments, under ~200 particles, no shadow maps unless they're cheap.

## Done when

`npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e` all pass unchanged. Then start the app with `npm run dev` and screenshot the plaza, café, platforms, and a dialogue panel to show the new style.
