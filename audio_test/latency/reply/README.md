# Current Gemini → ElevenLabs TTS benchmark

Run: `node --env-file=.env --import tsx audio_test/latency/reply-bench.ts`

Uses the actual current dialogue and speech providers: Gemini `gemini-3.8-flash`, structured evaluation, LOW thinking, eight-second deadline; ElevenLabs `eleven_v4_turbo`, approved NPC voices, complete MP3 buffering, five-second timeout, no TTS retries. Three cases (tea, coffee substitution, boss ticket request), three trials each. Synthesizes the actual returned replyZh, not a fixed replacement.

All nine trials failed at Gemini with PROVIDER_QUOTA (HTTP 429). No TTS requests were issued and no successful combined latency was measured. The diagnostic response identifies the exhausted free-tier daily allowance of 20 requests per project per model and a retry delay of roughly 20 hours 36 minutes. Results contain failure timings only; these must not be interpreted as generation latency.

Once quota is available, the benchmark records Gemini generation plus JSON validation, TTS completion, their combined duration, returned evaluation, and MP3 audio. It excludes microphone capture, transcription, player editing/waiting before Send, HTTP transport through the app, speech-job polling, and browser playback startup.

The current browser polls speech jobs with Retry-After 1 second, so actual playback availability can additionally wait until the next poll; that overhead is not measured by this provider-only benchmark.
