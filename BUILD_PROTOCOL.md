# Independent-account build and merge protocol

## Operating assumptions

One shared GitHub repository, canonical remote `origin`, integration branch `main`, separate checkout per person/account, npm workspaces, one lockfile. Copy this kit to that repository before invoking segments. Each account needs source read access; pushing and merging need the corresponding repository permissions. These are setup requirements, not game-design decisions left open.

The human's convention `Build Segment-NNN` authorizes implementation and a normal pull-request merge of that segment. It does not authorize bypassing branch protection or publishing a deployment. There is no dependency on another account's chat, memory, plugins, or local absolute path.

## 1. Read and inspect

Load the root agent entry point and requested packet. Fetch remote `main`; inspect uncommitted work and preserve it. Use a fresh isolated checkout/worktree if needed. Do not reset someone else's changes. Read the registry and the completed dependency records from **remote main**, not an unmerged local branch.

Completion records live at `.build/completed/Segment-NNN.json`; a record is authoritative only when present on remote main with a corresponding merged PR, or explicitly approved historical reconciliation evidence as described below. The registry describes planned tasks and is not a shared mutable progress board. Records must match the requested packet version: 1.2 for baseline packets and 1.3 for overhaul packets. Earlier incompatible implementations require migration/renewed acceptance rather than automatic completion.

If prerequisites are missing, do not mark the segment done and do not merge placeholder functionality. Report the exact missing segment. Inspection/design may continue locally, but shared file changes wait for dependencies. A missing API key does not block fixture implementation; required live acceptance is reported separately and cannot be falsely checked off.

## 2. Claim without a cross-account chat

### Historical reconciliation and versioned packets

This procedure addresses already integrated code, not future shortcuts. Baseline packets 000–009 retain version 1.2; overhaul 010–015 use 1.3. Match completion records to their packet version. A planning-version bump alone does not invalidate historical acceptance.

If code reached main directly without a merged PR (for example 001/002/006), do not rebuild it, create an empty cosmetic PR, adopt another account's branch or call a closed PR merged. Prepare one real baseline-audit PR on a separate audit branch. Document implementation/main SHAs, existing records, actual PR state and current fixture/live/manual checks in docs/BASELINE_RECONCILIATION.md and .build/reconciliations/baseline-v1.2.json. Preserve original records/history. The audit must contain substantive evidence, pass quality on current main and identify unresolved acceptance separately.

The requesting human must explicitly approve accepting those specific historical integrations through reconciliation, recorded with the concrete audit PR. A plan request or completion-file text alone is not approval. Once approved and normally merged, the audit PR is dependency evidence for only those listed segments. It is not the original implementation PR and does not erase prior failing CI. No future direct merge receives this exception automatically.

Segment-005 already has an implementation PR; its completion record should follow up normally on the owner's branch. Pending mandatory human microphone/listening evidence cannot be marked passed by merging a record. Coordinate without taking over another branch, or obtain an explicit handoff. A merged audit/record cannot replace required live proof.

010 assumes 007/008/009 will be complete but verifies actual merged records/acceptance before code work. The green-and-merge rules remain mandatory. Planning may prepare packets while prerequisites are unfinished; implementation cannot silently pass the gate.

Canonical work branch: `build/segment-NNN`. Check remote branch existence and open/merged PRs before building.

If absent, create the branch from current remote main and add `.build/claims/Segment-NNN.json` containing segment ID, authenticated account name, unique claim UUID, base main SHA, and timestamp. Commit the claim and push the canonical branch normally, **without force**. Recheck its remote SHA matches your claim commit before starting implementation.

Two accounts racing from the same base create divergent claim commits; only the first normal push creates the branch, and the other must stop or coordinate an explicit handoff. Do not adopt another account's branch because its work appears slow. Do not automatically expire a claim. A handoff uses the existing branch and PR after the human authorizes takeover; preserve its history.

For bootstrap 000, if the repository has no commits, first commit this kit as the setup baseline on main. This is the one pre-segment setup exception. Thereafter use the same claim and PR process as other segments.

Claims are coordination artifacts, not security locks. Keep canonical segment branches after merging during the hackathon; completion records prevent duplicate reruns. A normal branch push must contain the original claim in its history.

## 3. Build within ownership

Each packet lists writable paths. Keep shared imports stable. A needed change outside ownership is recorded in `.build/proposals/Segment-NNN.md` with the exact interface delta and why it is necessary. Do not merge an incompatible implementation behind a private duplicate type. Segment 000 establishes the common seams so ordinary segment work should need no proposal.

Dependencies, root package files, and lockfile are owned by 000, then 007 for the baseline; the later overhaul hands them to 010 for preparation, then 015 for integration. Other segments use already installed dependencies; if a new dependency is truly necessary, coordinate a small separate owner change and wait for it. Tests and fixtures for a segment belong under its named paths to avoid parallel collisions.

Use small commits. Fix defects relevant to the segment. Do not absorb unrelated cleanup or a missing prerequisite into the branch. In-progress PRs use title `[Segment-NNN] <concrete result>` and include scope, relevant behavior, checks, and remaining live acceptance.

## 4. What green means

Segment 000 must establish these repository-wide commands:

```text
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

`test` runs fixture-based unit/API tests. `test:e2e` runs fixture-based critical browser journeys. Install Playwright's browser runtime in CI. All commands pass from a clean checkout; no `--if-present`, skipped required jobs, or success from an empty suite is accepted. During bootstrap, substantive contract-schema and fixture smoke tests count; future-segment acceptance is not faked.

The segment's own acceptance criteria must also pass. Record manual evidence where graphics, audio, or live-provider behavior is required. CI never requires paid-provider secrets. Live integration segments need at least one real successful provider call and the specified manual checks before completion; if unavailable, leave a draft PR and an accurate limitation.

Every PR gets a named `quality` status that aggregates typecheck, lint, tests, build, and fixture browser smoke. Configure it as required with branches up to date, if repository settings allow. Otherwise the builder must manually enforce this same rule and report the missing protection; never claim that protection is installed when it is not. Only the repository administrator changes protections.

## 5. Integrate against current main

If the repository has no merge queue, serialize final integration with temporary remote ref `build/merge-lock`. Acquire it by creating a unique empty claim commit from remote main (account/segment/UUID in the message) in a temporary branch and pushing that ref normally, without force. Only the first divergent claim push succeeds. Do not modify the actual segment's history to create this lock. If occupied, continue other checks and retry in bounded intervals; never delete another account's lock. Hold your lock while synchronizing, running final CI, merging and verifying main. Release only the lock whose remote SHA still matches your claim; a crashed owner's lock needs an explicit handoff. This coordination ref contains no product changes and is never merged into main.

Before declaring green, fetch current remote main and merge it into the segment branch using a normal merge commit. Resolve conflicts within the segment's ownership and rerun required checks. If resolving a conflict would redesign another owner's interface, record a proposal and leave the PR unmerged. Do not choose “ours” wholesale.

Push the tested branch. Verify the PR head SHA equals the tested SHA, CI belongs to that head/merge result, and the dependency records remain present. Update `.build/completed/Segment-NNN.json` with ID, spec version, acceptance evidence, command outcomes, and limitations, then rerun/push because that is a new commit. The record becomes completion only after merge into main.

Use the repository's normal squash merge; no admin override. If a merge queue exists, enqueue the PR so the combined result is tested. Otherwise require up-to-date main and passing checks immediately before merge; if main changed, synchronize and retest. GitHub CLI supports head-SHA matching; use it to avoid merging a different PR revision. [GitHub CLI merge reference](https://cli.github.com/manual/gh_pr_merge), [GitHub merge queues](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)

Queue-backed automatic merge may be enabled if supported, but **enabled/queued is not merged**. Without a merge queue, invoke normal merge yourself only after checks pass while holding the merge lock; do not schedule a future merge and release the lock before it happens. Wait in bounded intervals for the actual merged state. Attach created PRs to the active Codex chat using the app's artifact tool when available. If required human review or permissions prevent merging, keep the concrete green PR ready, release your merge lock, and report the exact repository restriction. Do not request a generic approval that the human has already given through this convention.

## 6. Verify and report

After merge, fetch remote main, verify the merged PR and completion record, and run at least the build plus segment smoke test on the merged revision. If the combined code fails, create an in-scope follow-up fix; do not silently ignore the regression. Do not automatically revert another owner's code.

Final report: segment ID, implemented behavior, check results, PR URL, merged commit if actually merged, and any remaining limitation. A local commit, queued auto-merge, draft PR, and completed merge are distinct states. Do not mark success based only on pushing.

Recommended completion record shape:

```json
{
  "segment": "Segment-003",
  "specVersion": "1.2",
  "acceptance": ["fixture campaign passed", "boss coach hidden"],
  "checks": {
    "typecheck": "pass", "lint": "pass", "test": "pass",
    "build": "pass", "test:e2e": "pass"
  },
  "manualEvidence": ["voice controls and signs share one world session"],
  "limitations": []
}
```

Do not embed the same commit's SHA inside itself. The PR and Git history supply the revision. The claim record supplies ownership. Keep one completion file per segment so different accounts never contend over a shared checklist.
