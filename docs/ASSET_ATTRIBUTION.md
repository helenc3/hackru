# District assets (Segment-004)

The district uses original boxes, planes, low-poly capsules and spheres generated
with the repository's Three.js primitives. No downloaded models, textures,
or fonts are included. Downloaded audio is documented below. The palette and placement are authored for VibeQuest.
Chinese text uses installed system fonts: Noto Sans SC, PingFang SC, Microsoft
YaHei, then sans-serif. No font files are redistributed and there is no network
font dependency. Three.js, React and React Three Fiber retain their package
licenses in the dependency installation.

Landmarks and solid walls follow the frozen shared scene manifest. Flat colored
slabs are floor markings, not extra obstacles. Sign contents come only from the
server-projected visible cues. Platform labels identify geography; they never
show a recommended route or hidden PA transcript.

The world caps device pixel ratio at 1.5, uses one directional light, low-poly
primitives, no shadows and no postprocessing. The elevated camera has fixed
pitch and drag-controlled yaw. The capsule remains the fallback avatar.

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
