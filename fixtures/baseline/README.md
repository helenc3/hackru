# Segment-000 portable baseline

These JSON files are contract and presentation examples. They make no live API
calls, do not implement mission progression, and do not certify voice gameplay.

Use `createBaselineState('P1' | 'P2' | 'B1')` from `@vibequest/shared` for fresh,
independent fixture state. The same module exports typed baseline requests,
responses, evaluator context/output, and the server-issued transcription record.
The factory marks every session `validationMode: true`, `providerStatus: fixture`,
and keeps XP, loot, badges, and objectives unearned. Do not use it as the production
session engine.

- `public-states.json`: one public fixture per mission.
- `action-request.json`, `action-response.json`: inspection boundary examples.
- `turn-request.json`: Mandarin text plus an example transcription ID.
- `practice-turn-response.json`: NPC Mandarin, feedback, and Vibe dimensions.
- `boss-turn-response.json`: Mandarin reply with coaching and scores omitted.
- `transcription-response.json`, `transcription-record.json`: session/attempt-bound
  server provenance; a supplied ID alone is never sufficient verification.
- `turn-provenance-record.json`, `internal-state.json`: private server/engine
  handoff examples. Preserve the original STT string and derive the actual source
  before placing pending input into engine state. Never send these to a player.
- `turn-context.json`, `valid-evaluation.json`, `malformed-evaluation.json`: private
  Gemini boundary examples. Never serialize the evaluator to the player.

The malformed example intentionally has an invented slot, invalid score bounds,
and an oversized reply. Shared tests assert its rejection. Schemas and these
examples are frozen by Segment-000; mission content and engine behavior are
implemented in Segment-001, provider behavior in 002/005, and skill updates in 006.
