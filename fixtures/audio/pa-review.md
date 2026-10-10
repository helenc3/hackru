# PA / directions clip review

Status: **review pending human listen.** The results below are a machine round trip
(ElevenLabs TTS `eleven_multilingual_v2`, voice `EXAVITQu4vr4xnSDxMaL` "Sarah" →
ElevenLabs STT `scribe_v2`, `language_code=zh`), run 2026-10-10 with
`scripts/generate-pa.ts --verify`. A matching transcript suggests intelligibility; it
is not proof of natural pronunciation. Punctuation differences are ignored.

| Asset | Result | Heard (STT) |
|---|---|---|
| p1.station-directions.tier-0 | exact | 走到车站，售票处在右边。 |
| p1.station-directions.tier-1 | **differs** | 从演唱走到车站，进去后，售票处在右边。 |
| p1.station-directions.tier-2 | **differs** | 从延长走到车站，进去后，售票处在右边。 |
| p2.platform-change.tier-0 | exact | 江滨的列车改到三号站台。 |
| p2.platform-change.tier-1 | exact | 请注意，开往江滨的列车改到三号站台，不是二号站台。 |
| p2.platform-change.tier-2 | exact | 请注意，开往江滨的列车改到三号站台，不是二号站台。二号站台的车去机场。 |
| b1.harbor-change.tier-1 | exact | 开往海港的列车改到二号站台，一号站台的列车不再发车。 |

All quest-critical content (江滨, 海港, 机场, 一/二/三号站台) round-trips exactly in both PA cues.

Known issue: sentence-initial 广场 in the P1 directions clips was heard as 演唱/延长 on two
separate generations, so the voice likely mispronounces it. A human listener should check it.
If confirmed, try another voice (`ELEVENLABS_VOICE_PA=<id> … --force`) or rephrase via the
cue owner (Segment-001 content). The destination and counter location are unaffected.

`p1.station-directions` is a spoken-directions cue (小林), generated with the announcer voice.
Swap to 小林's NPC voice once Segment-005 assigns one.

## Live voice loop observations (2026-10-10)

These are machine checks, not a human listening review. Each was run with
`NODE_EXTRA_CA_CERTS` set to macOS's GlobalSign Root CA. This Mac's Homebrew Node is linked
to OpenSSL 4.0.3 and otherwise fails TLS to Google-issued certificates with
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.

- `scripts/smoke-elevenlabs.ts`: `eleven_flash_v2_5` text-to-speech passed for all three
  default NPC voices (270–503 ms). `scribe_v2` transcription results:
  - 小林 好的一杯茶十元: exact.
  - 阿陈 去江滨的车在三号站台: exact.
  - 老周 一张去海港的票，十五元 came back as 是五元. The number 十五 (15) was misrecognized,
    so short numeral replies need a human listening check with this voice.
- `scripts/smoke-gemini.ts`: practice P1 `order_drink`/tea and boss B1
  `buy_ticket`/haigang×1 both passed, and the boss reply had no coaching.
- Integrated server loop (real routes, live providers, player session, walked to the café):
  1. A synthesized clip of 你好，请给我一杯茶。 was uploaded through
     `POST /transcriptions`. Transcription returned the text exactly in 0.5 s.
  2. Send created the turn: Gemini plus the authored reply 一杯茶十元。请确认饮料和价格。 in
     1.5 s. Evidence was recorded as `spoken`.
  3. The speech job returned 200 `audio/mpeg`, 3.4 s long, in 1.0 s.
- Still pending: a human-recorded browser utterance, testing with two speakers, and a human
  listening review of the voices and PA clips.
