# Segment-001 fixture acceptance

The executable campaigns are in `apps/server/tests/game/helpers.ts` and use the
real session API, engine, and deterministic fixture dialogue provider. Run
`npm run test`. They cover café substitution and cancellation/kiosk, both P2
routes and wrong-platform repair, boss clear/failure, price/proximity gates,
request deduplication, concurrent retry, and ephemeral audio registries.

`confirm-drink-price.json` is the additive shared evaluation example. Both slots
are required for the engine gate. Missing slots remain schema-valid so providers
can ask for clarification. Recognized wrong prices stay intact; prices outside
0–1000 cannot enter the evaluation schema. The fixture adapter recognizes the
bounded pattern `茶|水` + decimal/Mandarin numeral + `元`, along with the explicit
examples in `packages/shared/src/engine/fixture-dialogue.ts`. Unknown utterances
produce clarification. It does not simulate general Gemini understanding.

Validation sessions simulate XP/items/badges in their own server state, record no
independent evidence, and have no endpoint that converts them into player
sessions. Typed and edited transcripts never become spoken evidence. PA
subtitles and validation transcripts remain assisted even after an audio replay.

Audio assets are not delivered by this segment. Cue asset IDs and tier-specific
variants are an integration seam for Segment-005. PA fixtures use an eight-second
asset duration plus a two-second callback allowance. NPC playback uses the ready
speech job's registered duration plus two seconds. Mandarin text/audio review
remains pending; no live STT, Gemini, or TTS acceptance is claimed here.

Skill promotion remains isolated in the existing Segment-006 extension module.
Terminal debriefs store modality counts and current tracks without pretending to
have implemented adaptation.
