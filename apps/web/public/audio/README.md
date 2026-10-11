# Mandarin audio

Use authored Hanzi directly for all synthesis; do not convert to pinyin or IPA.
Voice selections follow the [human-approved voice table](../../../../docs/MANDARIN_VOICES.md).

Only `rutgers-university-zh.mp3` is loaded by the app (the setup audio check in
`StartPanel`): Coco Li (`Ca5bKgudqKJzq8YRFoAz`), `eleven_v4`, `language_code: zh`,
`mp3_44100_128`. The `p1.*`, `p2.*` and `b1.*` clips are Spec 1.2 station PA
announcements kept as review provenance; nothing references them at runtime.
`fixtures/audio/pa-manifest.json` records their Hanzi, voices, models and hashes,
and `fixtures/audio/pa-review.md` the listening review.

Live NPC replies are synthesized on the server with `eleven_v4_turbo` using the
voices in `packages/shared/src/content/index.ts`. Playback needs no browser API key.
