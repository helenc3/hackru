# Street width and player controls update

Human-requested refinement of the existing city and player UI:

- Regional road widths increase by 1.3×: avenue 6.5 m, street 4.55 m, lane 1.95 m, promenade 3.9 m. Shared connectors, spawn, placements, routes, collision and rendering derive from the planner.
- Generator version advances from 2 to 3. Previously committed version-2 terrain must not mix with this layout; use a fresh world. There is no wire-schema change or regeneration of a revealed chunk.
- Shoulder camera distance increases from 3 to 3.8 m; wall clearance remains enforced.
- Native pointer capture owns world controls even if the browser retargets keyboard focus. Escape, a conversation, a hidden tab or actual window blur releases capture. Never request pointer capture and pointer lock together. A lock resolving after a conversation opens is released immediately.
- A saved local display preference in the intro and settings hides voice transcripts, partial captions, coaching examples, conversation summaries and written directions. Speech processing and deterministic quest rules remain unchanged. Explicit typed accessibility displays text. This preference is not a mastery or independent-listening certification.
- Quest event notifications expire five seconds after receipt; movement rerenders and duplicate event IDs cannot extend them. The redundant Q1 instruction paragraph is removed.

## Mouse capture verification

The focus-retargeting regression failed before the fix: blurring the world element immediately released capture. It now passes, including continued mouse input and Escape release. Tests also cover a delayed capture resolving after a conversation opens.

Local Chromium and WebKit automation refused native capture. WebKit 27.2 was tested separately without mocking the pointer-lock API: it selected the explicitly labelled bounded fallback, mouse-follow worked without dragging, and Escape released it. This verifies real fallback behavior, not successful native capture or its physical trackpad feel. The bounded mode follows the cursor inside the world window; unbounded capture remains subject to browser permission and focus rules.
