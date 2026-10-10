# VibeQuest build kit

This repository contains the portable specification and Segment-000 foundation for a four-person HackRU team. The foundation includes shared contracts, a static Mandarin world preview, explicit unfinished feature slots, server route stubs, and quality checks. Gameplay and live voice are built by the following segments. Every participating account must open a checkout of this repository and have its own GitHub authentication; accounts do not inherit this chat or access to another account's local files.

Once the kit is committed and repository access is configured, the entire build instruction can be:

> Build Segment-003

The root `AGENTS.md` resolves that request, loads the relevant documents, and instructs the builder to implement, validate, open a pull request, and merge when its checks pass. A segment can run in a fresh chat on a different account without prior conversation history. Dependencies must already be merged. No custom skill or chat-memory handoff is required.

## Start here

1. Clone `helenc3/hackru` into a dedicated local checkout. Do not build in the ChatGPT project's read-only `sources/` mirror.
2. Follow [local launch and validation](docs/LOCAL_LAUNCH.md). Verify the Segment-000 completion record and corresponding merged PR on remote main before beginning dependent work.
3. After 000 merges, dispatch **001 to A, 002 to B, 003 to C, and 004 to D** concurrently in separate checkouts.
4. B proceeds to 005; A proceeds to 006 when its dependencies merge. Run 007 for integrated acceptance, then 008 for the submission package. Segment 005 includes required microphone capture, Mandarin transcription, and spoken replies. Segment 009 is optional conversation pacing polish, never a release prerequisite.

Read [the product specification](IMPLEMENTATION_SPEC.md) for the game decisions; [the registry](SEGMENT_REGISTRY.md) for dependencies and ownership; [the build protocol](BUILD_PROTOCOL.md) for claims, tests, and merging; [the contract freeze](CONTRACT_FREEZE.md) for implementation seams; and [Segment-003](segments/Segment-003.md) for an example self-contained work packet.

The 24-hour schedule includes explicit cuts and buffer. It targets two practice missions, one boss, one coherent third-person world, Mandarin signs/PA/directions/actions, live Gemini NPCs, required ElevenLabs voice input/output, and transparent skill adaptation. The text harness is internal validation only.

This kit specifies automatic merging of an in-scope segment when the repository's checks and rules permit it. Missing permissions, unresolved required reviews, or a failed check are reported as a concrete blocker; they are never bypassed. Publishing a hosted deployment is a separate action from merging source code.

Run `python3 validate_kit.py` to check packet completeness, links, and the dependency graph. This validates the planning kit; the game's checks are implemented in Segment-000 and exercised by subsequent segments.

Version 1.2 supersedes the earlier Spanish/text-edition plan and the older `linguaquest_master_prompt.md` reference. Segment numbers remain stable; 003 owns integrated UI plus internal validation, 005 owns the entire required spoken loop, and 009 is optional pacing polish. Use the current packets and merged completion records rather than cached earlier instructions.
