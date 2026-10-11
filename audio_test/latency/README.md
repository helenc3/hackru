# Provider latency tests

Tests used configured API keys on one network. Small synthetic-speech samples are not general rankings. Times below exclude connection setup unless stated. All original JSON results and saved audio are retained.

## Experiments

| Files | Experiment | Outcome |
|---|---|---|
| [gemini-auto-turn-results.json](gemini-auto-turn-results.json) | Initial Gemini Live automatic-turn trials on a 3.28 s station clip. | First audio after 7.939 / error / 6.149 s. ElevenAgents was initially blocked by missing `convai_write`. |
| [gemini-explicit-turn-results.json](gemini-explicit-turn-results.json) | Gemini Live with explicit end-of-turn, like releasing push-to-talk. | 2.845 / 0.942 / 0.793 s; median 0.942 s. |
| [comparison-results.json](comparison-results.json) | Fresh automatic-turn comparison after replacing the ElevenLabs key. | ElevenAgents: 0.918 / 1.138 / 1.088 s. Gemini: 1.565 / error / 3.525 s. |
| [examples/](examples/README.md) | Two new audio prompts eliciting short and longer responses; two trials per service and prompt. | Eight successful trials with WAV responses, source MP3s and transcripts. |
| [tts/](tts/README.md) | Current regular TTS, three texts × three trials. | Full-MP3 medians: 0.265 s brief, 1.075 s typical, 2.105 s long; nine successes. |
| [reply/](reply/README.md) | Actual Gemini text generation followed by current TTS; three requests × three trials. | All nine blocked at Gemini by daily quota. No successful combined latency. |

The first three experiments used `apps/web/public/audio/p1.station-directions.tier-0.mp3`: “走到车站。售票处在右边。” It was decoded to mono 16 kHz PCM and streamed in real time. [ElevenAgents sample](elevenagents-response.wav) is from the fresh automatic comparison; [Gemini sample](gemini-response.wav) is from explicit-turn trial 2. The early harness records first-chunk latency and may stop before a full reply finishes; use `examples/` for longer response recordings.

## Models and voices

- **ElevenAgents:** Gemini 2.5 Flash for dialogue, Eleven v3 Conversational for speech, Sarah (`EXAVITQu4vr4xnSDxMaL`). This voice is outside the approved Mandarin list. Temporary agents were deleted after successful tests.
- **Gemini Live:** `gemini-3.8-live`, with no explicit voice selection. The early automatic comparison had one internal-error connection in each three-trial set.
- **Current pipeline:** `gemini-3.8-flash` structured evaluation, then `eleven_v4_turbo` with approved NPC voices. Regular TTS tested James Gao. The combined test preserves the real prompts, validation and timeouts, but exhausted Gemini’s 20-request daily free-tier quota. The reported reset delay was about 20 h 36 min at that attempt, not a current countdown.

## Reading the timings

Conversational **first audio** is end of the streamed input recording → first received output audio chunk. It includes automatic turn detection when enabled. Generated speech duration is playback length, not response-start delay; **last audio received** is download completion, not playback completion. ElevenAgents longer-response capture waits for 2.5 s of audio inactivity; Gemini uses `turnComplete`.

Regular TTS starts with reply text already available. **Full MP3** is the relevant current-server measurement because the provider buffers the whole file. Gemini → TTS combined timing would start with the player transcript already available and finish when the MP3 is ready. Neither includes STT, user editing/waiting before Send, application HTTP transport, browser audio startup, or the speech-job polling interval (currently one second).

Do not add a TTS-only median to an audio-to-audio result, or treat quota-error response times as generation latency.

## Reproduction

Run from the project root with installed Node dependencies, FFmpeg/ffprobe and provider keys in `.env`:

```sh
# Automatic-turn comparison; creates/deletes a temporary ElevenAgents agent.
node --env-file=.env audio_test/latency/bench.js
# Gemini-only explicit-turn comparison.
node --env-file=.env audio_test/latency/explicit.js
# Generate short/long inputs and collect full responses; creates/deletes a test agent.
node --env-file=.env audio_test/latency/examples/bench.js
# Current TTS provider settings.
node --env-file=.env --import tsx audio_test/latency/tts-bench.ts
# Actual current Gemini provider followed by actual TTS provider.
node --env-file=.env --import tsx audio_test/latency/reply-bench.ts
```

These commands consume live provider credits. Conversation scripts save reruns to timestamped `runs/` directories, preserving original experiments; TTS and combined scripts replace their corresponding benchmark outputs. ElevenAgents creation requires `convai_write`. `examples/temporary-agent.json` retains the deleted test agent ID as provenance.

Cleanup removed only Python bytecode and raw response PCM files verified byte-for-byte identical to their retained WAV payloads. Source inputs, every distinct recording, raw results, failures and reproduction scripts remain.
