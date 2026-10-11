# Stylesheet organization

`styles.css` and `game.css` are ordered import manifests. The application and
isolated world fixture keep their existing entry imports; do not also import
the individual feature files from components.

The files follow contiguous ranges of the original stylesheets. Their order
preserves the cascade, including the later HUD and panel layout rules that
override earlier component presentation. Shared selectors spanning features
(such as start/result actions and interaction/validation controls) remain
together. Keep these integration rules in their current ordered location.

Global tokens, defaults, shared chrome, buttons, audio, preview, feedback,
validation, accessibility, and responsive rules live in `styles/`. Shared
keyframes retain their early position; the reduced-motion policy remains last.
Game component content lives in `game/`, followed by shell, HUD, panel, and
validation overlay integration.

`../world/world.css` and `../audio/live.css` remain component-owned entries.
The world fixture intentionally does not load game or live-dialogue styles.

The current UI uses native controls rather than Radix. There are no Radix
override files, duplicate conversation blocks, or intro breakpoints to migrate
from the older refactor proposal. This refactor preserves existing selectors,
values, animations, breakpoint membership, and import sites without adding a
CSS framework or changing component classes.
