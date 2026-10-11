# Speak Your Way agent entry point

All numbered segments through Segment-010 are merged; the segment protocol below is historical and applies only if a new numbered packet is requested. For current behavior read [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md), [proposals/city-streaming-contracts.md](proposals/city-streaming-contracts.md), and [docs/LOCAL_LAUNCH.md](docs/LOCAL_LAUNCH.md); the code and tests are the source of truth where older documents disagree.

The human team chose numbered, independently invokable build segments. A request such as `Build Segment-003` means: implement that segment, run its acceptance checks and repository checks, commit/push its branch, create a pull request, and merge it when green and permitted by repository rules. Do not stop at a plan or ask again for routine in-scope implementation or merge authorization.

## Resolving a segment request

1. Normalize `003`, `Segment-003`, or `segment 3` to `Segment-003`.
2. Read `segments/Segment-003.md` (substitute the requested number) and `SEGMENT_REGISTRY.md`; `BUILD_PROTOCOL.md` and `CONTRACT_FREEZE.md` are Spec 1.2 history.
3. Read the specified sections of `IMPLEMENTATION_SPEC.md`; inspect current code and tests. Never rely on this chat's history.
4. Verify dependencies on the remote `main`, claim the segment as documented, then work only on its branch and owned files.
5. Implement the requested result, not just scaffolding, except where Segment-000 explicitly requires stubs. Verify against fixtures and acceptance criteria.
6. Follow the complete green-and-merge protocol. Report the PR, checks, verified merge state, and material limitations.

If the segment is complete on remote `main`, verify its completion record and do not rebuild it. If a different account owns its branch, do not overwrite it. If a dependency is missing, identify it and report the blocker; do not silently build another segment. If GitHub access is absent, make local progress only after reading available dependencies, preserve changes, and report that a merge was not possible.

## Product invariants

- Mandarin Chinese target language, Simplified Chinese world text and standard Mandarin audio; English instructions; single-player desktop browser.
- Character voice assignments must use only the human-approved ElevenLabs IDs in [docs/MANDARIN_VOICES.md](docs/MANDARIN_VOICES.md). Pass Simplified Chinese Hanzi directly to synthesis; do not convert to pinyin or IPA. Other catalog voices remain untested; Anna Su “Casual, Friendly and Bright” was explicitly rejected.
- Spec 2.0 campaign: three exploration quests offered in order — Q1 buy a drink, Q2 directions to 上海大酒店, Q3 a photo at 黄浦江 ([docs/NEW_QUESTS.md](docs/NEW_QUESTS.md)). No boss mode, boss timer, or freeze.
- The world is a Shanghai-style city streamed in chunks ([docs/CITY_GENERATION.md](docs/CITY_GENERATION.md), [frozen contracts](proposals/city-streaming-contracts.md)). Claude composes neighborhoods only from the approved component catalog behind `ENABLE_CLAUDE_CITY`; deterministic code validates every manifest, and a seeded fallback always works. Never execute generated code or download generated asset URLs.
- One coherent third-person player experience combines reading, spoken directions/conversation, and world actions. The developer text harness validates the same engine but is not a selectable game mode.
- Microphone capture, Mandarin STT, NPC dialogue (Claude when `ANTHROPIC_API_KEY` is set, otherwise Gemini; Gemini Live drives the real-time voice relay), and ElevenLabs Mandarin speech playback are core requirements. Typed/subtitle accessibility stays within the same world.
- AI interprets language and proposes dialogue or city layouts; deterministic rules own game facts, routes, landmark locations, progression, inventory, purchases, photos, and reward grants. Generating a feature or an AI claim of success never completes a quest.
- Developer-harness interactions grant no player achievement. Subtitle-assisted replies and edited transcripts never become independent listening/spoken evidence.
- No API secrets in the browser or commits. Tests default to fixture providers.
- No extra language, multiplayer, authentication, procedural quests, continuous voice, or pronunciation grader. City generation is limited to the catalog-only streamed city above.

## Testing policy

Do not run the full test suite on ordinary edits. While iterating, run only the checks in the blast radius of the change: the unit or UI spec files that cover the edited modules, the typecheck, and lint. Use `vitest run <files>` and `playwright test <files>` with explicit paths; prefer `--workers=1` for world and end-to-end journeys, which are flaky under parallel software rendering. Run the complete suite (`npm test`, `npx playwright test`, and the end-to-end config) only immediately before an actual commit, and report its full result in the commit summary.

## Coordination rules

The protocol and frozen contracts take precedence over incidental examples in the product spec for ownership and invocation. The product spec defines behavior. Ask only about an actual incompatible requirement or missing authorization; routine choices are made within the specification. Record a needed interface change in a proposal rather than changing another owner's API silently.

Never force-push another account's branch, edit the team's unrelated files, disable failing tests, weaken merge protections, or represent fixture behavior as live provider behavior. Complete all available checks before reporting a permission blocker. Do not publish the site, change repository security settings, or message teammates unless the human separately authorizes those actions.

Use the requesting human's configured Git identity for commits. If none exists, use their authenticated GitHub login and verified GitHub noreply address; never invent an identity. Do not add AI or bot co-author trailers. The explicit numbered-build authorization above supersedes older reference instructions that prohibit commits or pushes.

Spec 2.0 replaces the 1.2 station campaign with the streamed-city quests (Segment-010). Spec 1.2 replaced prior language and voice scope. Keep stable segment IDs but use revised packets: 003 integrated UI/validation, 005 required spoken loop, 009 optional pacing polish. Any existing 1.1 implementation must migrate incompatible fields and rerun acceptance; a 1.1 completion record alone does not satisfy 1.2.
