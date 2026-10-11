# VibeQuest agent entry point

These instructions apply when this build kit is installed at the implementation repository root. The human team has chosen numbered, independently invokable build segments. A request such as `Build Segment-003` means: implement that segment, run its acceptance checks and repository checks, commit/push its branch, create a pull request, and merge it when green and permitted by repository rules. Do not stop at a plan or ask again for routine in-scope implementation or merge authorization.

## Resolving a segment request

1. Normalize `003`, `Segment-003`, or `segment 3` to `Segment-003`.
2. Read `BUILD_PROTOCOL.md`, `SEGMENT_REGISTRY.md`, `CONTRACT_FREEZE.md`, and `segments/Segment-003.md` (substitute the requested number).
3. Read the specified sections of `IMPLEMENTATION_SPEC.md`; inspect current code and tests. Never rely on this chat's history.
4. Verify dependencies on the remote `main`, claim the segment as documented, then work only on its branch and owned files.
5. Implement the requested result, not just scaffolding, except where Segment-000 explicitly requires stubs. Verify against fixtures and acceptance criteria.
6. Follow the complete green-and-merge protocol. Report the PR, checks, verified merge state, and material limitations.

If the segment is complete on remote `main`, verify its completion record and do not rebuild it. If a different account owns its branch, do not overwrite it. If a dependency is missing, identify it and report the blocker; do not silently build another segment. If GitHub access is absent, make local progress only after reading available dependencies, preserve changes, and report that a merge was not possible.

## Product invariants

- Mandarin Chinese target language, Simplified Chinese world text and standard Mandarin audio; English instructions; single-player desktop browser.
- Character voice assignments must use only the human-approved ElevenLabs IDs in [docs/MANDARIN_VOICES.md](docs/MANDARIN_VOICES.md). Pass Simplified Chinese Hanzi directly to synthesis; do not convert to pinyin or IPA. Other catalog voices remain untested; Anna Su “Casual, Friendly and Bright” was explicitly rejected.
- Three authored missions: café practice, platform-change practice, connection boss.
- One coherent third-person player experience combines reading, spoken directions/conversation, and world actions. The developer text harness validates the same engine but is not a selectable game mode.
- Microphone capture, Mandarin STT, Gemini NPC response, and Mandarin speech playback are core Segment-005 requirements. Typed/subtitle accessibility stays within the same world.
- AI interprets language and proposes dialogue; deterministic rules own game facts, progression, inventory, timers, and reward grants.
- Active boss responses omit coaching, translations, hints, and evaluator scores. Boss hints/freeze are rejected by the server.
- Developer-harness PA grants no listening evidence/player achievement. Subtitle-assisted PA and edited transcripts never become independent listening/spoken evidence.
- No API secrets in the browser or commits. Tests default to fixture providers.
- No extra language, multiplayer, authentication, procedural city, continuous voice, or pronunciation grader.

## Coordination rules

The protocol and frozen contracts take precedence over incidental examples in the product spec for ownership and invocation. The product spec defines behavior. Ask only about an actual incompatible requirement or missing authorization; routine choices are made within the specification. Record a needed interface change in a proposal rather than changing another owner's API silently.

Never force-push another account's branch, edit the team's unrelated files, disable failing tests, weaken merge protections, or represent fixture behavior as live provider behavior. Complete all available checks before reporting a permission blocker. Do not publish the site, change repository security settings, or message teammates unless the human separately authorizes those actions.

Use the requesting human's configured Git identity for commits. If none exists, use their authenticated GitHub login and verified GitHub noreply address; never invent an identity. Do not add AI or bot co-author trailers. The explicit numbered-build authorization above supersedes older reference instructions that prohibit commits or pushes.

Spec 1.2 replaces prior language and voice scope. Keep stable segment IDs but use revised packets: 003 integrated UI/validation, 005 required spoken loop, 009 optional pacing polish. Any existing 1.1 implementation must migrate incompatible fields and rerun acceptance; a 1.1 completion record alone does not satisfy 1.2.
