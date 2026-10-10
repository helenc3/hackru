# Numbered segment registry

Use this stable registry to dispatch work. Status is deliberately **planned** in the JSON: actual progress comes from claims, PRs and per-segment completion records on remote main. This kit has not implemented or merged any segment.

| ID | Result | Dependencies | Suggested owner |
|---|---|---|---|
| [Segment-000](segments/Segment-000.md) | Repository bootstrap and contract freeze | — | A |
| [Segment-001](segments/Segment-001.md) | Authoritative engine, authored missions, and session API | 000 | A |
| [Segment-002](segments/Segment-002.md) | Gemini NPC dialogue and language evaluation | 000 | B |
| [Segment-003](segments/Segment-003.md) | Integrated game UI and internal text validation | 000 | C |
| [Segment-004](segments/Segment-004.md) | Third-person freely navigable district | 000 | D |
| [Segment-005](segments/Segment-005.md) | Required Mandarin voice loop and PA playback | 000, 002 | B |
| [Segment-006](segments/Segment-006.md) | Evidence-based skill adaptation and debrief | 000, 001, 003 | A |
| [Segment-007](segments/Segment-007.md) | Integrated acceptance and production build | 000, 001, 002, 003, 004, 005, 006 | A |
| [Segment-008](segments/Segment-008.md) | Submission package and final demo readiness | 007 | C/D |
| [Segment-009](segments/Segment-009.md) | Optional conversation pacing polish (optional) | 005, 007 | B/C |

## Parallel dispatch

First run 000 once. After it merges, run 001/002/003/004 simultaneously on four accounts/checkouts. 002 → 005; 001 + 003 → 006. Merge all core segments before invoking 007. Then invoke 008. 005 includes all required voice input/output. 009 only improves conversation pacing after 005 and 007; it is not a prerequisite of 008.

A = engine/integration; B = AI/audio; C = integrated UI/internal validation; D = world. The same person can use different accounts in later segments, provided the remote claim is respected. These letters are suggested assignments, not identities used to authorize access.

000 freezes contracts; 001 implements the server engine; 003 builds the integrated UI and internal harness against fixtures; 004 implements world-only rendering. 005 owns required recording, STT, TTS and playback files and 006 owns isolated skill/debrief files, avoiding conflicts with 003. 007 owns cross-boundary integration fixes after parallel segments have merged. Never schedule integration segment 007 concurrently with unmerged core changes.

File ownership is explicit in each packet. Root package/lockfile edits are restricted to 000 and 007. The human/team can authorize a small owner change if a required dependency was missed; other accounts do not independently rewrite the lockfile.

Invocation in a repository with this kit at root: `Build Segment-003`. For a fresh account, only repository access and this request are needed; it reads the root entry point and linked documents. If the root AGENTS.md is not discovered by the client, use: `Read AGENTS.md and build Segment-003`.

The machine-readable equivalent is [segment-registry.json](segment-registry.json). Completion record format and merge rules are in [BUILD_PROTOCOL.md](BUILD_PROTOCOL.md).

Version 1.2: Mandarin Chinese and one voice-led world. The text harness is development-only; 003 is not a second gameplay edition, 005 is not voice-output-only, and 009 is not the first delivery of speech input. Prior 1.1 completion records require migration.
