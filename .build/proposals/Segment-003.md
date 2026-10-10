# Segment-003 scope and integration notes

## Implemented ownership

Only app/session transport, shared UI (excluding SkillDebrief), developer
validation, segment-owned browser tests/fixtures, and this segment's build
records change. No package, lockfile, server, engine, provider, world, audio,
debrief, or schema changes are requested.

The app keeps the bootstrap preview only while the health endpoint explicitly
reports an unimplemented engine. Start/Continue always go through the frozen
session API. Active sessions render the integrated world UI, even if the health
metadata still describes the bootstrap. Nothing infers quest success locally.

## Parallel integration

- 001: all action/turn/state responses are validated. Mutations serialize in the
  client coordinator; versions are read when dispatched. Mission retry bypasses an
  outstanding provider turn, fetches its reserved version, and invalidates old
  UI responses; failed-turn retry preserves the ID while fetching a fresh version.
  Stale responses refresh
  from authoritative state. Retries preserve IDs and dialogue input.
- 002: coaching and Vibe dimensions are consumed only for practice. The client
  rejects active-boss response bodies containing prohibited feedback.
- 004: use the unchanged WorldRenderer props. Dialogue stops movement keys from
  bubbling and keeps focus within an editable/control context. World controls
  must also ignore editable/interactive DOM targets as required by its packet.
- 005: unchanged Recorder.onTranscript binds the server transcription ID and
  original string; Send marks unchanged/edited text accurately. AudioController
  receives speechId. Audio lifecycle callbacks share the mutation queue; the pending UI does not
  block recorder stop controls. Retry closes the panel and clears speech before
  the new attempt can consume an old reply.
- 006: SkillDebrief remains an untouched slot on terminal result panels.

## Bootstrap smoke migration to coordinate if required

The existing `apps/web/tests/shell.spec.ts` is outside 003 ownership and currently
asserts a 501 session seam. Once 001 implements session creation, its owner or
007 must migrate that historical assertion to the implemented behavior (or make
the unavailable-response case an explicit routed fixture). This segment does not
weaken or edit that smoke test. If it changes on main while 003 builds, integrate
the new test normally; if it blocks quality, preserve the exact failure for an
owner-approved change. The API health engine field also needs its owner to report
implemented status once the engine is ready.
