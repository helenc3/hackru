# Approved Mandarin voices

These nine ElevenLabs voices were judged accurate by the requesting human after
listening to the 20-voice comparison in [audio_test](../audio_test/README.md).
This is the approved voice list for future character assignments. Use exact voice
IDs; similarly named voices are not interchangeable. In particular, Anna Su's
“Casual, Friendly and Bright” voice (`9lHjugDhwqoxA5MhX0az`) was explicitly
judged inaccurate and must not be used. Other voices exist in the broader catalog
but were not tested in this comparison. The remaining voices in the 20-voice
comparison were tested but were not included in the approved list.

| Approved voice | ElevenLabs voice ID | Catalog accent |
| --- | --- | --- |
| Adam Li - Deep, Steady and Calm | `hZTuv9Zqrq4yHYrEmF1r` | singapore mandarin |
| Adrian - Chinese Mandarin Narration | `agczkAUlHLowaNnL72Cc` | standard |
| Anna Su - Trustworthy, Clear and Natural | `r6qgCCGI7RWKXCagm158` | taiwan mandarin |
| Coco Li - Calm, Young and Trustworthy | `Ca5bKgudqKJzq8YRFoAz` | standard |
| Evan Zhao - Warm, Calm and Trustworthy | `MI36FIkp9wRP7cpWKPTl` | beijing mandarin |
| Haoran - Deep, Calm and Steady | `pU9NaAwkoR3v0Mrg3uKz` | beijing mandarin |
| James Gao - Calm, Friendly and Warm | `4VZIsMPtgggwNg7OXbPY` | standard |
| Jason Chen - Deep, Magnetic and Calm | `DowyQ68vDpgFYdWVGjc3` | beijing mandarin |
| Karo Yang - Clear, Lively and Energetic | `5mZxJZhSmJTjL7GoYfYI` | standard |

## Rules for future audio work

- Voice characters only with the approved IDs above. Choose a voice from this table
  when assigning a new character or replacing an existing voice. An unlisted voice
  needs explicit human listening approval before joining this list.
- Do not use IPA for synthesis, pronunciation correction, or fallback. The human
  reported that IPA never worked in this comparison; abandon this approach.
- Always pass authored Simplified Chinese Hanzi directly to synthesis for less
  friction. Do not convert character dialogue or prerecorded lines to pinyin or IPA.
- Keep review findings tied to the tested model and inputs. The comparison used
  `eleven_v4`, `language_code=zh`, and `mp3_44100_128`; it does not separately certify
  `eleven_v4_turbo` or every future dialogue line. Review pronunciation when changing
  models or generation settings. STT agreement alone is not tone approval.

## Review provenance

The human listened to all 120 samples: 20 Chinese-labeled voices, two authored
lines, and three representations (1: Hanzi; 2: tone-marked pinyin; 3: IPA).
The source lines were `b1.harbor-change.tier-1` and `p2.platform-change.tier-2`.
Exact inputs, voice metadata, and generated-file hashes are recorded in
[inputs.json](../audio_test/inputs.json), [voices.json](../audio_test/voices.json),
and [manifest.json](../audio_test/manifest.json). Catalog accent labels above are
provider metadata; inclusion in this table reflects the human's listening judgment.

## Current assignments

| Character or audio role | Assigned voice | Voice ID |
| --- | --- | --- |
| 小林 / Xiaolin — café owner, spoken directions | Coco Li — Calm, Young and Trustworthy | `Ca5bKgudqKJzq8YRFoAz` |
| 阿陈 / Achen — station worker | James Gao — Calm, Friendly and Warm | `4VZIsMPtgggwNg7OXbPY` |
| 老周 / Laozhou — ticket agent | Adam Li — Deep, Steady and Calm | `hZTuv9Zqrq4yHYrEmF1r` |
| Station PA announcements | Adrian — Chinese Mandarin Narration | `agczkAUlHLowaNnL72Cc` |
| Setup audio check | Coco Li — Calm, Young and Trustworthy | `Ca5bKgudqKJzq8YRFoAz` |

The player avatar uses the player's microphone or typed input and has no synthetic
voice assignment. Live NPCs use `eleven_v4_turbo`; prerecorded lines use `eleven_v4`.
Environment overrides must also select approved IDs. Unapproved overrides are rejected.

Historical IPA samples remain in `audio_test` as evidence of the rejected experiment.

## Streamed city character identities

City NPCs derive gender, visual identity and speech from their reviewed name key. 老王 and 老周 use male appearance and Adam Li; 小李, 阿陈 and 大张 use male appearance and James Gao. 小林 and 小美 use female appearance and Coco Li; 王阿姨 uses female appearance and Anna Su “Trustworthy, Clear and Natural”. Optional NPCs choose a seeded gender first, then a name from its matching profiles. Clothing style varies independently while preserving the character appearance. Named city identities take precedence over legacy role voice overrides. Both recorded replies and live conversations use these approved ElevenLabs voices. Live Gemini audio is suppressed; ElevenLabs synthesizes the committed reply as 24 kHz PCM for the existing relay. This introduces a synthesis delay before speech.
