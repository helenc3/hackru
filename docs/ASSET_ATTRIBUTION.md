# World assets

The district uses original boxes, planes, low-poly capsules and spheres generated
with the repository's Three.js primitives. No downloaded models, textures,
or fonts are included. Downloaded audio is documented below. The palette and placement are authored for Speak Your Way.
Chinese text uses installed system fonts: Noto Sans SC, PingFang SC, Microsoft
YaHei, then sans-serif. No font files are redistributed and there is no network
font dependency. Three.js, React and React Three Fiber retain their package
licenses in the dependency installation.

Geometry comes from committed chunk manifests built from the approved catalog
(`packages/shared/src/city/catalog`, rendered by `apps/web/src/city/assets`).
Signs are scenery; their text is authored content, never a route hint. Toon
materials and the palette live in `apps/web/src/world/toon.tsx`. The world caps
device pixel ratio at 1.5 and uses no shadows or postprocessing.

Boundary checks live in `apps/web/tests/world`. The isolated fixture under
`fixtures/world` records shared callbacks without granting mission progress.
It is never imported or served by the production app.

## Kenney audio library

All ten free packs in [Kenney's current Audio catalog](https://kenney.nl/assets/category:Audio)
were downloaded on 2026-10-10 into `apps/web/public/assets/audio/kenney/`,
in separate folders preserving the original audio filenames. Original license
and credit text is embedded in the single library manifest; promotional shortcuts
and redundant documentation files have been removed.
Creator: Kenney (https://kenney.nl). License: CC0-1.0; attribution is optional.
The library is available for future integration; these clips are not wired into gameplay.
English voiceover clips must not replace Mandarin NPC dialogue or mission announcements.

The library's `manifest.json` lists every audio file with source pack, path,
browser URL, filename-based description, tags, duration, audio format, size,
and SHA-256. It also records each source download URL, archive checksum, and
original license and credit text.
Descriptions are inferred from filenames and pack context; listening review
is pending. Pack preview montages have been removed; the catalog contains
744 individual clips.

## CC-CEDICT dictionary

Word lookup and shift-click glosses use CC-CEDICT (https://www.mdbg.net/chinese/dictionary?page=cc-cedict),
installed through the data-only npm package `cedict-json` (1.3.20251213, CEDICT release of 2025-12-13).
Copyright © MDBG and the CC-CEDICT contributors. License: Creative Commons Attribution-ShareAlike 4.0
International (CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/). The server converts the
numbered pinyin to tone marks at load time; the entries are otherwise unmodified. Any redistribution of the
dictionary data itself must keep this attribution and the same license.
