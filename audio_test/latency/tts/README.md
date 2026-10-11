# Current ElevenLabs TTS benchmark

Run with `node --env-file=.env --import tsx audio_test/latency/tts-bench.ts`. Model eleven_v4_turbo; station NPC James Gao (4VZIsMPtgggwNg7OXbPY); language zh; mp3_44100_128; SDK textToSpeech.convert; five-second timeout and no retries, matching the current provider. Three trials per text on one connection environment. All nine succeeded.

First audio means first received nonempty chunk. Complete means entire MP3 received, which is what the current server waits for before returning audio. These timings exclude STT, Gemini dialogue generation, app transport and browser playback. Input text is fixed; this test does not measure factual accuracy.

| Text | Characters | First audio median | Complete-file median | Complete-file range | Playback duration range |
|---|---:|---:|---:|---:|---:|
| brief | 3 | 0.264 s | 0.265 s | 0.264–0.579 s | 0.80–0.80 s |
| typical | 32 | 1.070 s | 1.075 s | 1.071–1.215 s | 7.28–7.44 s |
| long | 72 | 2.050 s | 2.105 s | 2.065–2.128 s | 15.84–16.40 s |

## Saved audio

- **brief:** 好的。 [Trial 1](brief-1.mp3) · [Trial 2](brief-2.mp3) · [Trial 3](brief-3.mp3)
- **typical:** 去江滨的列车改到三号站台了。售票处在右边，车票十五元，请先买票。 [Trial 1](typical-1.mp3) · [Trial 2](typical-2.mp3) · [Trial 3](typical-3.mp3)
- **long:** 别紧张，列车还有十分钟才出发。请先到右边的售票处买票，票价十五元。去江滨的列车现在从三号站台发车，不是二号站台。如果走错站台，请向工作人员求助。 [Trial 1](long-1.mp3) · [Trial 2](long-2.mp3) · [Trial 3](long-3.mp3)

[Raw timings and request metadata](results.json). Rerunning replaces this benchmark’s files.
