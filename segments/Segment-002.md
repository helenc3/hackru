# Segment-002: Gemini NPC dialogue and language evaluation

Spec version 1.2 · Suggested owner B · Invocation: **Build Segment-002**

## Context available to a fresh account

Speak Your Way is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 4, 7, 8, 11, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-000](Segment-000.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `apps/server/src/providers/dialogue.ts`
- `apps/server/src/providers/gemini/**`
- `apps/server/tests/providers/gemini/**`
- `fixtures/gemini/**`
- `scripts/smoke-gemini.*`
- `.build/claims/Segment-002.json`, `.build/completed/Segment-002.json`, `.build/proposals/Segment-002.md`

All other paths are read-only for this segment unless the human explicitly expands scope. Normal ownership exceptions are coordinated through the protocol, not copied private types.

## Build steps

1. Implement fixture and live DialogueProvider factories with server-only Gemini configuration. Start with configurable gemini-3.8-flash and verify actual account access.
2. Use one structured-output model call for allowlisted intent/slot evaluation, evidence quote, scores and proposed Mandarin dialogue. Match installed SDK field names to official docs; validate every value with shared schemas.
3. Create bounded prompts for 小林 (Xiaolin)/阿陈 (Achen)/老周 (Lao Zhou), immutable facts, tiers, recent history, player input as data, and boss coach=null. Unknown meaning produces clarification.
4. Cap input/history/output, implement 8-second overall budget and at most one transient retry, and expose normalized provider errors without mutating game state.
5. Supply fixture examples for imperfect Mandarin, paraphrases, English-only, unknown input, repetition, insults, injection, invalid slots and conflicting facts. Add numeral variants, destination aliases, short Hanzi utterances and an ambiguous STT transcript; output replyZh in Simplified Chinese, never an unsupported tone grade. The engine uses authored critical facts, not free-form route text.

## Acceptance criteria

- Adapter produces a valid practice evaluation and a boss evaluation with coach null from at least one real account call; keep credentials out of artifacts.
- All schema, allowed-value, and malformed-response tests pass; invented slot values are rejected.
- At least 12 documented language examples are exercised; at least 5/6 designated valid Mandarin intent examples succeed; English-only does not satisfy target-language gate.
- Timeout/quota failure maps to a recoverable error; mock mode is labeled fixture and never claims novel language comprehension.
- System-override dialogue cannot create a state action or reward.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

## Exclusions

Do not add ElevenLabs audio or mutate shared engine/state, routes, lockfile or contracts. If live access is missing, keep a useful draft PR but do not mark this segment completed.

## Deliver and merge

Claim `build/segment-002` using the remote claim procedure, implement the scope, and create `[Segment-002] Gemini NPC dialogue and language evaluation` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
