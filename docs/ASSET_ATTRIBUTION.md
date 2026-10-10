# District assets (Segment-004)

The district uses original boxes, planes, low-poly capsules and spheres generated
with the repository's Three.js primitives. No downloaded models, textures, audio
or fonts are included. The palette and placement are authored for VibeQuest.
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
