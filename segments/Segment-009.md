# Segment-009: Optional conversation pacing polish

Spec version 1.2 · Suggested owner B/C · Invocation: **Build Segment-009**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), [BUILD_PROTOCOL.md](../BUILD_PROTOCOL.md), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), [CONTRACT_FREEZE.md](../CONTRACT_FREEZE.md), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 7, 9, 11, 13, 14. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-005](Segment-005.md), [Segment-007](Segment-007.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `apps/web/src/audio/** (pacing refinements only)`
- `apps/server/src/providers/elevenlabs/** (cache/scheduling refinements only)`
- `apps/server/tests/audio/pacing/**`
- `apps/web/tests/audio/pacing/**`
- `fixtures/audio/pacing/**`
- `docs/VOICE_LATENCY.md`
- `.build/claims/Segment-009.json`, `.build/completed/Segment-009.json`, `.build/proposals/Segment-009.md`

All other paths are read-only unless the human explicitly expands scope. Coordinate interface changes through the protocol.

## Build steps

1. Run only after the required voiced world campaign passes 007 and before feature freeze. This segment improves the existing core voice loop; it does not first deliver voice input.
2. Measure baseline Stop-to-reply-audio timing and identify the largest avoidable delay. Reuse existing providers/contracts; shorten redundant waits and improve recording/status transitions.
3. Optimize TTS scheduling/cache reuse for already displayed Mandarin lines, preserve one-audio-at-a-time playback, and refine compact confirmation controls without automatically grading unconfirmed text.
4. Improve practice replay/slow-audio controls, microphone shortcuts and perceived waiting feedback inside the same world panel. Do not add new game modes or change boss assistance semantics.
5. Compare a 10-turn baseline and follow-up sample, rerun all integrated regressions and preserve the simpler baseline when changes do not help.

## Acceptance criteria

- Required STT/Gemini/TTS campaign still passes; microphone input was already present before this segment.
- Actual before/after latency observations and any limited gains are recorded honestly; no unverified subsecond claim.
- No overlapped speech, duplicate evaluation, auto-submission while IME composing, unlimited boss pause, or evidence-source change.
- The one-world interaction style and opt-in accessibility controls remain consistent; core checks stay green.

Run all repository checks and fixture browser smoke as well. Live acceptance is additional; unavailable mandatory live evidence keeps the segment incomplete. Never put paid credentials in CI.

## Exclusions

Optional polish only. No continuous voice service migration, websocket rewrite, pronunciation grading, new language/world, or new feature dependency. Cut this segment entirely when time is short.

## Deliver and merge

Claim `build/segment-009` using the remote claim procedure, implement the scope, and create `[Segment-009] Optional conversation pacing polish` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
