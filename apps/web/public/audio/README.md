# Mandarin audio

Use authored Hanzi directly for all synthesis; do not convert to pinyin or IPA.
Voice selections follow the [human-approved voice table](../../../../docs/MANDARIN_VOICES.md).

All eight static clips use `eleven_v4`, `language_code: zh`, and `mp3_44100_128`:
- 小林's directions and the setup audio check: Coco Li (`Ca5bKgudqKJzq8YRFoAz`).
- Platform-change and harbor-change PA announcements: Adrian (`agczkAUlHLowaNnL72Cc`).

Live NPC dialogue uses `eleven_v4_turbo`: Coco Li for 小林, James Gao for 阿陈,
and Adam Li for 老周. Playback requires no browser API key.

Regenerate: `node --env-file-if-exists=.env --import tsx scripts/generate-pa.ts --force --verify`.
Voice assignments are authored in `packages/shared/src/content/index.ts`: character
`voice` descriptions for NPCs and `audioVoices` for PA and setup audio.
The manifest records actual Hanzi, voices, models, and hashes.
See `fixtures/audio/pa-review.md` for verification and listening limitations.
