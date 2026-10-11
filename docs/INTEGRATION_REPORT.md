# Segment-007 integration report

Spec 1.2 · branch `build/segment-007` · base `origin/main` 2d6d0c9 · 2026-10-10

## Status

**Incomplete: the in-world microphone mission is pending.** 10 live STT → Gemini → TTS round trips are measured below. Every fixture, harness, world and production check passes. The required live voiced world mission (sign → recorded Mandarin → Gemini → ElevenLabs reply → consequential action) has not been demonstrated end to end. Per the packet, the missing in-world microphone run keeps the segment incomplete.

## Scope: live / fixture / deferred

| Capability | State |
|---|---|
| Engine, missions P1/P2/B1, timers, rewards, boss guards | Authored rules on the server; fixture and real-server tests |
| NPC interpretation (Gemini) | Live; 10 live turns observed. CI uses the fixture provider only |
| STT / NPC speech (ElevenLabs) | Live adapter implemented; live STT and TTS observed (see latency) |
| PA announcements | Reviewed prerecorded Mandarin assets in `apps/web/public/audio` |
| Validation harness | Development only. Production rejects the route, the sessions and the bundle entry |
| Fixture demonstration | Opt-in (`ENABLE_DEMO_FIXTURES`), labelled "Fixture demonstration · scripted responses" in the world |
| Hosted deployment | Prepared (`HOST`/`PORT`, single origin). Not published: no deployment target is authorized |
| Demo checkpoint loader | Not built (optional in §15) |

## Integration fixes in this segment

- `/api/health` reported `buildId: segment-001` and `dialogue`/`speech: unimplemented` after Segments 002/005 had merged. It now reports `segment-007` and `live`/`unconfigured` based on the server's key configuration (`apps/server/src/app.ts`).
- The server always bound to `127.0.0.1`, so it couldn't be hosted. Optional `HOST` (default loopback) in `apps/server/src/config.ts`.
- `LOCAL_LAUNCH.md` still described the Segment-000 scaffold. It is updated for the integrated build, hosting and live acceptance.
- **World retry desync** (found by the real-server boss journey): after "Retry mission" / "Restart mission", the client kept the old avatar position while the server reset it, so the next step was rejected ("Movement exceeds the authored speed") and the attempt was unplayable. The world now remounts per attempt (`apps/web/src/app/App.tsx`).
- **Repair XP after subtitle-assisted PA:** the +20 "first independent repair" XP was granted even when the platform-change PA was heard through subtitles, contradicting §5 (subtitle-assisted PA is not independent). The repair evidence and XP now use the same assisted check as listening (`packages/shared/src/engine/index.ts`).
- **Pause & Learn** showed nothing with the conversation closed; it now opens the latest practice feedback (`App.tsx`). It stays hidden in the boss.
- **Targeted practice after a boss failure:** "Return to practice" always started P2, even when the debrief targeted P1. The debrief now carries an optional `nextPracticeMissionId` (compatible contract addition, `.build/proposals/Segment-007.md`).
- **Missing audio** fell through to `index.html` with a 200; unknown `/audio/*` now returns 404.
- Audit found these correct: the harness is absent from the production bundle and navigation; the skill debrief is shown on every result; Recorder/AudioController are mounted in the world dialogue; all 7 PA variants match the manifest text and sha256; the boss hides the coach, hints, freeze and pause in the UI and rejects them in the API.

## Checks (this branch)

`npm run typecheck`, `lint`, `test` (118 unit/API + kit check), `build`, `test:e2e` (49 browser tests with a scripted API + 10 real-server journeys): all pass.

## Real-server journeys (`tests/e2e`, part of `npm run test:e2e`)

Every existing browser test used a scripted API. These journeys run the production bundle and server with fixture dialogue, with no mocks:

- `world-campaign.spec.ts`: P1 played by walking the avatar (held keys): read the sign, enter, speak typed Mandarin to 小林, take the coffee→tea substitution, pay, receive directions, walk to the concourse. The final objectives/inventory/XP/badges/unlocks **equal** the developer-harness API path on a development server. Production rejects validation sessions and `/__validation`, and serves UI, API and PA assets from one origin.
- `world-missions.spec.ts`: P2 and the boss in the world, compared with the harness. Boss: no coach, hints, freeze or answer chips in the UI; hint/freeze/pause rejected by the API; failure → fresh attempt without reward duplication.
- `recovery.spec.ts`: live-provider outage (no keys) shows a retryable recovery with the draft preserved and no state, reward or timer change. Reply-audio failure falls back to the subtitle without blocking progress. A server restart shows the expired session and a working fresh start. Duplicate turn/action IDs return identical responses with a single reward; a reused ID with a different payload → 409 `ID_CONFLICT`; a stale version → 409 `STALE_VERSION`, and the UI resynchronizes.

## Live provider observations

Command: `tests/e2e/live-acceptance.ts` (see `LOCAL_LAUNCH.md`). Synthesized Mandarin clips go through the real server endpoints: recording phase → STT upload → confirmation → Gemini turn → TTS reply.

Run 1 used `gemini-3-flash-preview` until it hit the daily cap. Runs 2 and 3 used `gemini-3.8-flash`, after quota reset on 2026-10-10. Times in ms; the last column is Stop → reply audio ready.

| Player clip | STT heard | NPC reply (Gemini) | STT | Gemini | TTS | Total |
|---|---|---|---|---|---|---|
| 你好！ | 你好。 | 你好！欢迎光临。想喝点什么吗？ | 380 | 1413 | 253 | 2046 |
| 你好！ | 你好。 | 你好！请问想喝点什么？我们有茶和水。 | 358 | 3905 | 512 | 4775 |
| 我要咖啡。 | 我要咖啡 | 咖啡卖完了。我们有茶和水。 | 496 | 2480 | 507 | 3483 |
| 那就茶吧。 | 那就好吧。 | 那你想喝茶还是水呢？茶十块，水五块。 | 350 | 2057 | 509 | 2916 |
| 车站怎么走？ | 车站怎么走？ | 从广场走到车站。进去后，售票处在右边。 | 338 | 4591 | 508 | 5437 |
| 请再说一遍。 | 请再说一遍。 | 从广场走到车站。进去后，售票处在右边。 | 370 | 2749 | 508 | 3627 |
| 售票处在右边吗？ | 手票处在右边吗？ | 对，售票处在右边。请问还需要喝点什么吗？ | 321 | 2487 | 507 | 3315 |
| 茶多少钱？ | 查多少钱？ | 一杯茶十元。请确认饮料和价格。 | 500 | 4790 | 510 | 5800 |
| 茶十元，对吗？ | 茶室苑，对吗？ | 一杯茶十元。请确认饮料和价格。 | 371 | 3481 | 509 | 4361 |
| 谢谢。 | 谢谢。 | 不客气！你想点一杯茶吗？ | 404 | 7970 | 509 | 8883 |

- **10 successful live spoken round trips**: median ≈ 4.0 s, max 8.9 s Stop → reply audio, within the p95 ≤ 22 s target. Replies stayed grounded in authored facts (coffee sold out, tea 10/water 5, the directions).
- **Gemini latency is the bottleneck:** 1.4–8.0 s with `thinkingLevel: LOW`. Across runs 2 and 3, 3 turns exceeded the 8 s budget (`PROVIDER_TIMEOUT`); the server returned a retryable 503 and committed nothing. Untested option: `ThinkingLevel.MINIMAL` in `apps/server/src/providers/gemini/live.ts`. Measure interpretation quality before switching.
- **Free-tier quota:** 20 requests/day per model; the cap was reached again mid-run (`PROVIDER_QUOTA`). Enable billing before rehearsal.
- **STT on synthesized clips** misheard 茶 (那就好吧 / 查 / 茶室苑) and 售 (手), so the drink choice never advanced in the script. A human microphone test is needed to judge real recognition; typed or edited fallback covers recovery.
- Turn outcomes are now logged per §11 (turn ID, elapsed time, provider/model, committed/failed with reason; no keys or audio).
- During the outage the server returned a retryable 503 and committed no turn, as specified.
- **Demo risk:** 20 requests/day can't cover rehearsal plus the demo (each NPC turn is one request; the session cap is 30). Enable billing on the Gemini project, or use a paid key, before rehearsals.
- The local `.env` has `PORT=5173`, which collides with the Vite dev port. The documented value is `PORT=3001`.

## Manual checks still required

1. Microphone in the world: speak to 小林 in a live session, confirm the transcript, hear the spoken reply, complete P1 (needs Gemini quota).
2. Demo laptop: ≥ 30 fps in the district (CI has no GPU; `world.spec.ts` checks fps only where WebGL is available).
3. Hosted smoke test, after the team authorizes a deployment target.

## Residual risks

- In-memory sessions: any restart expires play in progress (the UI recovers with a fresh start).
- After a reload, "Continue Session" is offered for a session the server may already have dropped. The expiry appears only after the click.
- Fixture sessions still synthesize reply audio with ElevenLabs when a key is present. The text is scripted, but the voice is live TTS.

## Cuts

None. All three missions, the voice loop, adaptation and debrief are in the build.
