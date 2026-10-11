# UI fixtures

`scripted-api.ts` is a test-only response tape for the Playwright specs under
`apps/web/tests`. It validates the request/response schemas, request versions, input
provenance and rendered behavior. It does not implement the engine or certify
Claude/Gemini, microphone capture, STT, TTS or language quality. No fixture module is
imported by production.

Browser tests cover Start/Continue, expired sessions, provider retry with the same
turn ID, pending-turn handling, stale-state recovery, XP projection, coaching, IME
composition, keyboard containment, microphone permission recovery and WebGL
compatibility. `fixtures/validation/campaigns.ts` scripts the three quest journeys
(drink, hotel directions, river photo) for the internal validation harness; its
progress is labeled simulated and uses a separate storage key from player sessions.

To open the harness locally: set `ENABLE_VALIDATION_HARNESS=true` and
`VITE_ENABLE_VALIDATION_HARNESS=true` in `.env`, restart `npm run dev`, and open
`http://127.0.0.1:5173/__validation`.
