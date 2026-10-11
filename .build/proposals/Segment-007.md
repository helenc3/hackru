# Segment-007 compatible contract proposal

**Change:** `DebriefSchema` gains optional `nextPracticeMissionId: 'P1' | 'P2'`.

**Why:** Spec §3 says a boss failure "offers a targeted practice replay". `updateSkillsAfterAttempt` already chooses the practice mission from the weakest skill (conversation → P1, otherwise P2), but that choice was only embedded in `nextPracticeReason` prose. `ResultPanel`'s "Return to practice" always started P2, so the button could contradict the debrief.

**Compatibility:** The field is optional and additive, so existing debriefs and fixtures still parse. The engine sets it; the UI falls back to P2 when it is absent. Missions, guards and reward rules are unchanged; `startMission` still enforces unlocks on the server.

**Owner:** A (integration, Segment-007). Applied in `packages/shared/src/contracts.ts`, `packages/shared/src/engine/skills.ts` and `apps/web/src/ui/ResultPanel.tsx`.
