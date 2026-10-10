# Segment-003 UI evidence

The scripted API response tape is test-only. It validates the frozen request and
response schemas, request versions, input provenance, and rendered behavior.
It does not implement a game engine or certify Gemini, microphone capture, STT,
TTS, movement, or language quality. No fixture module is imported by production.

Browser tests cover Start/Continue, expired sessions, provider retry using the
same turn ID and a refreshed version, pending-turn mission restart with late-reply
isolation, stale-state recovery, honest XP projection, practice coaching,
boss restrictions, IME composition, keyboard containment, microphone permission
recovery, countdown synchronization, and WebGL compatibility.

The internal validation journeys include café substitution/kiosk branches,
platform direct/confirmation branches with wrong-board recovery, boss clear and
failure/retry, and a three-mission session. All validation progress is labeled
simulated and uses a different storage key from player sessions. Real engine and
voiced-campaign integration acceptance remains with Segment-007.

To access the harness locally after the engine lands: enable the server and Vite
validation flags documented in the root launch guide, restart development, and
open `http://127.0.0.1:5173/__validation`. Server permission is required; normal
player navigation has no validation link. This segment preserves the frozen
world/audio/debrief props and installs no dependencies.
