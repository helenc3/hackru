# Segment-005 proposals and out-of-scope touches

## 1. Active PA playback lookup (implemented inside 005 scope)

`playCue` with `channel: 'audio'` issues a server playback ID, but `PublicState` does not expose it, so the client could never call `finishCue` and audio-only PA could not be delivered.

Instead of changing the frozen `PublicState`, the audio router (005-owned) adds a read-only route:

| Route | Output |
|---|---|
| `GET /api/sessions/:id/cue-playback` | `{ playback: { playbackId, cueId, audioAssetId, finishAfterMs } \| null }` |

It returns only the current attempt's undelivered, uninterrupted `audio` channel playback. It never starts, completes or renews a cue. `finishAfterMs` reflects the engine's existing rule that `finishCue` is accepted from two seconds before the 10-second deadline. All reviewed clips are shorter than 8 seconds, so the client waits that long after the audio ends before reporting.

**Requested of the contract owner (optional):** expose `activeCuePlayback` on `PublicState` and derive the PA deadline from the asset duration, as NPC speech does. The route can then be removed.

## 2. Bootstrap stub assertions updated

`apps/server/tests/app.test.ts` and `apps/server/tests/providers.test.ts` (owned by 000) asserted `501 SEGMENT_NOT_IMPLEMENTED` from the speech scaffold. Now that 005 implements it, they assert the real behavior:
- With no key, speech returns a recoverable `503`.
- An empty multipart upload returns `400`.
- An unknown session's speech ID returns `404`.

The provider test no longer sets a fake ElevenLabs key, so unit tests make no network call.

## 3. Requested follow-ups (not done here)

- `apps/server/src/app.ts` health still reports `segments.speech: 'unimplemented'` (000/007 owner).
- `p1.station-directions` sentence-initial 广场 is misheard by STT in tiers 1–2 (see `fixtures/audio/pa-review.md`). The content owner (001) may want to rephrase it, or the team can choose another voice.

## 4. Browser assertions on the old voice stubs

`apps/web/tests/shell.spec.ts` and `apps/web/tests/ui/game-ui.spec.ts` (000/003) looked for the `recorder-stub` and `audio-controller-stub` placeholders and their "Unimplemented · Segment-005" text. They now find the real `recorder` and `audio-controller` controls.

The Segment-000 preview's Start button is now asserted visible rather than disabled. That preview only renders when the API reports the engine unimplemented, which is no longer the case.
