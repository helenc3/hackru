# Stylesheet organization

`styles.css` and `game.css` are ordered import manifests. `main.tsx` and the
isolated world fixture import `styles.css`; `App.tsx` imports `game.css`. Do
not also import the individual feature files from components.

Order matters: later files override earlier ones (HUD and panel layout rules
override component presentation). Add new rules to the file that owns the
component and keep the manifests' order.

`styles/` holds global tokens, reset, keyframes, shared chrome, buttons, audio,
the welcome preview, compatibility, validation, skill debrief, and responsive
rules; the reduced-motion policy stays last. `game/` holds game component
content followed by shell, HUD, panel-overlay and validation-overlay
integration; `mission-results.css` overrides `panel-overlays.css` and
`forms-start.css`, and `quest-cards.css` comes after it.

Component-owned entries imported directly by their components:
`../world/world.css`, `../audio/live.css`, `../dictionary/dictionary.css`,
`../dictionary/lookup.css`, `../city/gallery/gallery.css`. The world fixture
intentionally loads none of the game or live-dialogue styles.

Native controls only; there is no Radix or CSS framework.
