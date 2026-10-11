# Live Mandarin response examples

Both services received the same ElevenLabs-generated audio, streamed as mono PCM 16 kHz in real time. New conversation for each trial; automatic turn detection; identical station facts and response instructions. No game implementation changed.

ElevenAgents: Gemini 2.5 Flash generates dialogue; Eleven v3 Conversational synthesizes Sarah (`EXAVITQu4vr4xnSDxMaL`), outside the approved Mandarin list. Inputs were synthesized with Eleven v4 / George (`JBFqnCBsd6RMkjVDRZzb`), also outside that list. Gemini comparison: Gemini 3.8 Live native audio. These are different reasoning models, so this is a configured-system comparison, not an isolated voice-model benchmark.

First audio is the first received audio chunk measured from the end of the input recording, excluding setup. Output length is WAV playback duration. Last audio is the time to receive the final audio chunk, not playback completion. ElevenAgents completion uses 2.5 seconds of audio inactivity; Gemini uses turnComplete.

## Inputs

- [short input](input-short.mp3): 请问，去江滨的列车现在在哪个站台？请用两句话告诉我怎么走。
- [long input](input-long.mp3): 我第一次来这个车站，有点紧张，怕赶不上去江滨的火车。请用五到六句话，先安慰我，再一步一步告诉我在哪里买票、票价多少、去哪个站台，还有走错站台时该怎么办。

## Results

| Scenario | Provider | First audio | Last audio received | Response duration | Audio |
|---|---|---:|---:|---:|---|
| short-1 | eleven | 1.18 s | 2.62 s | 7.60 s | [Listen](eleven-short-1.wav) |
| short-1 | gemini | 1.56 s | 3.62 s | 9.57 s | [Listen](gemini-short-1.wav) |
| short-2 | gemini | 1.43 s | 3.16 s | 8.75 s | [Listen](gemini-short-2.wav) |
| short-2 | eleven | 3.69 s | 5.15 s | 7.12 s | [Listen](eleven-short-2.wav) |
| long-1 | eleven | 2.48 s | 9.60 s | 35.28 s | [Listen](eleven-long-1.wav) |
| long-1 | gemini | 2.34 s | 8.79 s | 27.41 s | [Listen](gemini-long-1.wav) |
| long-2 | gemini | 2.55 s | 11.37 s | 38.09 s | [Listen](gemini-long-2.wav) |
| long-2 | eleven | 4.44 s | 13.82 s | 49.76 s | [Listen](eleven-long-2.wav) |

Exact input transcripts and response text, including expressive tags, are preserved in [results.json](results.json). Source prompts are in [inputs.json](inputs.json).

## Limitations and observations

Small sample on one network and API account, with synthetic speech rather than real learner recordings. Audio files have not been subjectively rated for naturalness. Both services made unsupported route assumptions in at least one short response. Gemini consistently transcribed 江滨 as 江边 in these runs; it sometimes repaired this using the supplied context, and sometimes repeated the wrong destination. First long ElevenAgents response followed the requested 5–6 sentence structure; Gemini replies and the second ElevenAgents long reply exceeded it. Reassurance was explicitly requested in the words, so these samples do not prove recognition of emotion from vocal tone alone.

Temporary ElevenAgents test agent deleted after all eight successful trials.

Rerun from the project root: `node --env-file=.env audio_test/latency/examples/bench.js`. New artifacts go into timestamped `runs/` directories. Requires Node dependencies, FFmpeg and both API keys; consumes provider credits and creates/deletes a temporary ElevenAgents agent.
