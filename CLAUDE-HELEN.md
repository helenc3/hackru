# CLAUDE.md - Development Guidelines

## 1. Git & Commit Boundaries (STRICT)

**You do NOT commit code. Helen verifies, stages, and commits all changes.**

- **NEVER execute `git commit`, `git push`, or `git add` commands.**
- **NEVER create co-author trailers** (`Co-authored-by:`) or git attributions in commit messages or code comments.
- Your task stops once the code is edited and local tests/checks pass.
- At the end of a task, list the modified files and suggest a `git diff` command so Helen can inspect and commit the changes.

---

## 2. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask before writing code.
- Present multiple valid interpretations instead of picking one silently.
- Propose simpler alternatives or push back if a request is overly complex.
- Stop immediately if requirements are ambiguous and ask clarifying questions.

---

## 3. Simplicity First

**Write the minimum code needed to solve the problem. Nothing speculative.**

- Do not add unrequested features, speculative abstractions, or unused configuration options.
- Avoid writing error handling for impossible or improbable scenarios.
- If a 50-line implementation works safely, do not write 200 lines. Rewrite to simplify.
- Ask: "Would a senior engineer consider this overcomplicated?" If yes, reduce complexity.

---

## 4. Surgical Changes

**Touch only what is necessary. Clean up only your own changes.**

When editing existing code:
- Do not modify adjacent code, formatting, or comments unless directly requested.
- Match surrounding code style and existing conventions.
- Do not refactor unbroken code. If you notice pre-existing dead code, point it out—do not delete it.

When your changes create unused code:
- Clean up any imports, variables, or functions rendered unused by *your* edits.
- Leave pre-existing unused code intact unless explicitly instructed to remove it.

Every changed line must trace directly to Helen's prompt.

---

## 5. Goal-Driven Execution & Local Verification

**Define success criteria and verify locally before handing off.**

Transform tasks into verifiable targets:
- **Bug Fix / Feature:** Run or write tests to prove the fix before declaring completion.
- **Refactoring:** Ensure tests pass before and after modifications.

For multi-step tasks, state a concise plan with verification checks:
1. [Step 1] -> verify: [check]
2. [Step 2] -> verify: [check]
3. [Step 3] -> verify: [check]

Once verified locally, hand off the changes to Helen for review and git operations.