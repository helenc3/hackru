# Segment-006: Evidence-based skill adaptation and debrief

Spec version 1.2 · Suggested owner A · Invocation: **Build Segment-006**

## Context available to a fresh account

VibeQuest is a single-player desktop Mandarin Chinese simulation for four mostly first-time hackathon teammates. The finished product has one third-person world with Simplified Chinese signs and standard Mandarin audio. Players read signs, follow spoken directions, speak to NPCs, and take consequential actions within the same mission. Two practice missions coach the player; a boss requires independent completion. Microphone input → ElevenLabs STT → Gemini interpretation/dialogue → ElevenLabs NPC speech is required core functionality. The text-only MVP is a developer validation harness, not a game mode. Authored rules own facts, progression, timers and rewards. Plan against 24 hours and protect voice plus coherent world gameplay before adding breadth. This packet requires no chat history.

## Mandatory reads

Read [AGENTS.md](../AGENTS.md), `BUILD_PROTOCOL.md` (removed in 37f445d; see git history), [SEGMENT_REGISTRY.md](../SEGMENT_REGISTRY.md), `CONTRACT_FREEZE.md` (removed in 37f445d; see git history), and [IMPLEMENTATION_SPEC.md](../IMPLEMENTATION_SPEC.md) sections 4, 5, 7, 13. Inspect current implementation/tests. The protocol defines claiming, green checks, and automatic merge; do not rely on another account's conversation.

## Dependencies

[Segment-000](Segment-000.md), [Segment-001](Segment-001.md), [Segment-003](Segment-003.md)

Required dependency completion records and corresponding merged PRs must exist on remote main before implementation. Do not silently implement a missing prerequisite. Independent fixture work is allowed only as described in the build protocol; completion cannot be claimed before dependencies exist.

## Writable scope

- `packages/shared/src/engine/skills.ts`
- `packages/shared/tests/skills/**`
- `apps/web/src/ui/SkillDebrief.tsx`
- `apps/web/tests/skills/**`
- `fixtures/skills/**`
- `.build/claims/Segment-006.json`, `.build/completed/Segment-006.json`, `.build/proposals/Segment-006.md`

All other paths are read-only for this segment unless the human explicitly expands scope. Normal ownership exceptions are coordinated through the protocol, not copied private types.

## Build steps

1. Implement reading/listening/conversation/repair evidence and the bounded mastery update exactly as specified. Use existing engine extension hooks; no new global state library.
2. Deduplicate evidence by mission attempt/cue and first independent attempt. Store assistance separately; validation/subtitle-assisted PA adds no independent listening evidence; verified unedited STT alone earns spoken evidence.
3. Select the next authored practice tier at mission start using evidence thresholds. Keep boss fixed at tier 1 and show weak-track practice recommendation only where evidence supports it.
4. Build the isolated result component showing mastered actions, one useful correction, evidence counts, the reason for next-practice selection, and single badge and modality summary.
5. Add deterministic fixed-history fixtures proving promotions/demotions and assisted-success behavior. Show spoken/typed/edited/subtitle evidence honestly in one badge/debrief. Do not promise CEFR validity or pronunciation assessment.

## Acceptance criteria

- Fixed evidence examples produce exact expected mastery/count values, at most one tier movement, and no mid-mission change.
- Assisted retry and duplicate cue cannot farm mastery; provider errors add no evidence.
- Validation/subtitle-assisted PA keeps independent listening count unchanged; lack of listening evidence is described as untested, not weak.
- Boss debrief appears only after the result and boss tier stays fixed.
- Player sees a concrete explanation connecting an observed action to the next practice challenge.

Run the repository-wide typecheck, lint, unit/API tests, production build, and fixture browser smoke. Acceptance above is additional to these checks. Use existing shared fixtures and put segment-specific cases in owned paths. Live credentials are never required by CI. A mandatory live check that cannot run remains pending.

## Exclusions

Do not add model-based student memory, a placement test, a vector database, or a separate progression service. Use frozen debrief fields and the existing mission variants.

## Deliver and merge

Claim `build/segment-006` using the remote claim procedure, implement the scope, and create `[Segment-006] Evidence-based skill adaptation and debrief` as the PR title. Include behavior and actual validation evidence. Merge latest remote main into the branch, rerun checks, push, verify matching PR revision and required CI, and merge normally when green. A queued merge is not completion.

Add the per-segment completion record before final CI; it is authoritative only after the PR merges. Verify remote main contains the record and passes the merged-revision smoke check. Report the PR link, verified merged commit, checks, and limitations. If a real dependency, permission, review, or acceptance blocker remains, preserve a concrete reviewable PR and say exactly what is missing; never invent a successful merge.
