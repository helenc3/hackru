# PA / directions clip review

Subsequent human comparison review approved nine voices in
[docs/MANDARIN_VOICES.md](../../docs/MANDARIN_VOICES.md) and rejected IPA entirely.
Current game assignments now use approved voices with direct Hanzi input:
Coco Li for 小林's directions and the setup check; Adrian for both PA cues.
All eight newly generated files matched authored text through `scribe_v2`, ignoring
punctuation. The manifest records their current hashes and voice IDs. These new
renders retain pending listening status; voice approval does not certify every line.

Live assignments are Coco Li for 小林, James Gao for 阿陈, and Adam Li for 老周.
Hanzi is required; pinyin/IPA conversion is not used. The observations below are
historical and concern earlier configurations.

Status: **v4 machine verification passed; human tone review pending.**

On 2026-10-10 the human identified incorrect tones, including 第二号站台,
and requested a solution covering arbitrary live shopkeeper dialogue.
Full pinyin failed content transcription across all eight clips; joined-word
pinyin also misread a sample. Targeted substitutions cannot solve general
dialogue and have been removed from the generation path.

All eight static assets were regenerated with `eleven_v4`, original Sarah/George
voices, `language_code=zh`, and unchanged authored Chinese. All eight matched
their authored text through `scribe_v2`, ignoring punctuation. Manifest hashes
and synthesis inputs describe these final files.

Live dialogue defaults to `eleven_v4_turbo` with the original NPC voices. Both
v4 variants were tested with Sarah on “请到第二号站台。一杯茶十元，两杯咖啡三十元。”
and transcribed exactly. The speech smoke script additionally checks all three
NPCs with platform numbers, café prices, and ticket prices.

ElevenLabs documents v4 as applying native target-language pronunciation when
the output language differs from the source voice:
https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4
This is a model-level improvement, not a deterministic guarantee of every tone.
STT checks intelligibility and content; it cannot certify correct tones. A human
listening review is still required, especially for short replies and polyphones.

The following historical observations concern the earlier model configuration:

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
