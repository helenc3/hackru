# TODO

## Live practice NPCs do not use the approved ElevenLabs voices

**Discrepancy.** AGENTS.md requires character voices to come only from the human-approved
ElevenLabs IDs in `docs/MANDARIN_VOICES.md`. The clip-based lane (`apps/server/src/routes/audio.ts`
→ `providers/elevenlabs/live.ts`) honors this. The real-time lane (`apps/server/src/live/relay.ts`
→ `apps/web/src/audio/live-voice.ts`) streams Gemini Live's built-in `Kore` voice instead, because
Gemini Live is the only provider offering a single bidirectional audio stream with VAD and
barge-in. So Xiaolin and the other practice NPCs sound different in live conversation than in
recorded replies and the boss fight.

**Tried (2026-10-11).** Branch `feat/elevenlabs-live-voice` (commit 46f8be5, based on `0cf8c32`,
local only): keep Gemini for listening and turn detection, hold its audio, and on `turnComplete`
synthesize the reply text with `speechProvider.synthesize` and send one MP3 `speech` event; fall
back to the held Gemini audio on failure; `LIVE_NPC_VOICE=gemini` toggles back. Typecheck, lint,
146 unit tests and the live-voice Playwright spec passed; a live smoke produced a 1.75 s clip in
0.7 s. Not adopted: it adds roughly 1 to 2 s of reply latency because synthesis can only start
after Gemini's full reply text arrives, and the branch predates the Spec 2.0 NPC ids
(`vendor`/`guide`/`passerby`), so `voiceFor` and the relay call site need updating before merge.

**Options if revisited.**
- Cherry-pick the branch and switch Gemini Live to `Modality.TEXT` so it streams text only; the
  relay's turn-boundary signals (`message.data`, `outputTranscription`) must then come from
  `modelTurn.parts[].text` and `turnComplete`.
- Replace the lane with ElevenLabs realtime STT → Claude → ElevenLabs streaming TTS and own VAD and
  interruption in the relay.
- Accept the voice mismatch and document it in `docs/MANDARIN_VOICES.md`.
