# Numbered segment registry

Use this stable registry to dispatch work. Status is deliberately **planned** in the JSON: actual progress comes from claims, PRs and per-segment completion records on remote main. This registry declares planned work, not implementation status; inspect remote completion evidence. Baseline packets remain version 1.2; post-baseline overhaul packets use 1.3.

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

| [Segment-010](segments/Segment-010.md) | Overhaul contracts and parallel preparation | 007, 008, 009 | Integration lead |
| [Segment-011](segments/Segment-011.md) | Original papercraft characters | 010 | A |
| [Segment-012](segments/Segment-012.md) | Papercraft district and close camera | 010 | B |
| [Segment-013](segments/Segment-013.md) | World-first onboarding and contextual interface | 010 | C |
| [Segment-014](segments/Segment-014.md) | Hands-free conversation and Presage adaptation | 010 | D |
| [Segment-015](segments/Segment-015.md) | Overhaul integration and refreshed demo package | 011, 012, 013, 014 | Integration lead |

## Parallel dispatch

First run 000 once. After it merges, run 001/002/003/004 simultaneously on four accounts/checkouts. 002 → 005; 001 + 003 → 006. Merge all core segments before invoking 007. Then invoke 008. 005 includes all required voice input/output. 009 only improves conversation pacing after 005 and 007; it is not a prerequisite of 008.

A = engine/integration; B = AI/audio; C = integrated UI/internal validation; D = world. The same person can use different accounts in later segments, provided the remote claim is respected. These letters are suggested assignments, not identities used to authorize access.

000 freezes contracts; 001 implements the server engine; 003 builds the integrated UI and internal harness against fixtures; 004 implements world-only rendering. 005 owns required recording, STT, TTS and playback files and 006 owns isolated skill/debrief files, avoiding conflicts with 003. 007 owns cross-boundary integration fixes after parallel segments have merged. Never schedule integration segment 007 concurrently with unmerged core changes.

File ownership is explicit in each packet. Root package/lockfile edits are restricted to 000 and 007. The human/team can authorize a small owner change if a required dependency was missed; other accounts do not independently rewrite the lockfile.

Invocation in a repository with this kit at root: `Build Segment-003`. For a fresh account, only repository access and this request are needed; it reads the root entry point and linked documents. If the root AGENTS.md is not discovered by the client, use: `Read AGENTS.md and build Segment-003`.

The machine-readable equivalent is [segment-registry.json](segment-registry.json). Completion record format and merge rules are in [BUILD_PROTOCOL.md](BUILD_PROTOCOL.md).

Version 1.2: Mandarin Chinese and one voice-led world. The text harness is development-only; 003 is not a second gameplay edition, 005 is not voice-output-only, and 009 is not the first delivery of speech input. Prior 1.1 completion records require migration.


## Post-baseline four-person overhaul

Assume 007/008/009 will already be built; verify their actual merged records at dispatch. Do not modify those packets to fold in new work. Run 010 once to extract/mount seams, freeze additive schemas, neutral facades and dependencies. Then A builds 011 characters, B builds 012 world/camera, C builds 013 interface and D builds 014 hands-free voice/Presage. All four depend only on 010, never on an unmerged peer. Run 015 after all four merges to repair compatible seams and refresh the already-built demo package.

During 011–014: 011 owns world/characters; 012 owns other world files; 013 owns app/ui; 014 owns audio/sensing/server conversation and pre-wired topic modules. Root packages/shared schemas remain frozen. Exact writable paths and exceptions are in the packets and [overhaul interface freeze](docs/OVERHAUL_INTERFACES.md). This phase supersedes earlier suggested A/B/C/D roles, not baseline ownership history.

Invoke Build Segment-010, then Build Segment-011 / 012 / 013 / 014 in four separate checkouts, then Build Segment-015. Reference images are supplied for art at build time. [Planning prompt](docs/OVERHAUL_PLANNING_PROMPT.md) can refine the plan without building.

Historical direct integrations may be reconciled only through a substantive audited PR and explicit human-approved exception under BUILD_PROTOCOL. Missing required live checks remain pending. Planning preparation is allowed while prerequisites are unfinished; building is not.
