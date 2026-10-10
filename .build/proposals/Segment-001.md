# Segment-001 integration proposals

Status: human-authorized additive contract integrated locally; GitHub delivery pending.

## Required drink-price evaluation (owners: 000 shared contracts, 002 provider)

Add `confirm_drink_price` to `IntentSchema` and add a `priceCny` slot with
integer value 0–1000 to `SlotSchema`. Allow exactly `drink` and `priceCny` for
this intent; drink must be tea or water. Missing details must remain representable
for clarification. Extend shared provider context intent-count bounds as needed
and update provider allowlists, fixtures, and schema tests through their owners.

The provider must normalize Mandarin numerals, retain recognized wrong prices,
and clarify unrecognized/out-of-range prices. Engine rules will confirm only
tea/10 or water/5 against the current, uncancelled selection. Reply text and
generic scores cannot substitute for these slots. The requesting human explicitly authorized the shared contract/fixture and obsolete
bootstrap-test changes in this session. The additive schema and allowlist changes
are implemented, and P1 checks the exact uncancelled drink/price pair.
Segment-002 remains responsible for live-provider numeral normalization; its
provider scaffold is unchanged. The independent Segment-001 fixture adapter
normalizes documented numeral examples and clarifies out-of-range input.

## Audio session handoff (owner: 005)

`SessionRecord` owns ephemeral transcription and speech-job maps, never public
game state. `registerTranscription`, `resolveTranscription`, `registerSpeechJob`,
`updateSpeechJob`, and `invalidateAttemptArtifacts` are exported from
`apps/server/src/session-store.ts`. Invoke them within `withSession`; capture the
attempt before network work and register/update only after reacquiring the lock.
An obsolete attempt returns false on registration/update and cannot create jobs.

A committed reply registers one speech job binding session, attempt, turn,
authoritative Mandarin reply, voice key, and operation ID. Segment-005 reads
pending jobs through the injected store, synthesizes outside the lock, then
atomically marks ready/failed. Ready jobs carry duration and server-only bytes.
Retrieval can trigger this work without changing ServerServices or adding a
second registry. TTS failure never rolls back a committed turn. A ready job is
the only authority to register NPC playback; duration plus two seconds bounds it.

Transcription resolution derives unchanged `stt` or changed `stt-edited` from
the stored original, preserves edited text separately, and rejects expired or
wrong-attempt IDs. Attempt replacement clears both registries and retains abandoned audio operation ID tombstones so old callbacks cannot register recording operations. Pending/completed
request maps live on the same session record; abandoned-ID tombstones survive
attempt replacement. API reservation/commit integration is implemented and tested with deferred providers.

## Local delivery constraints

Remote main contains a spec-1.2 Segment-000 completion record. GitHub CLI is
unauthenticated, so its corresponding merged PR could not be verified and no
authenticated remote claim was made. Local work is on `build/segment-001` under
the protocol's GitHub-unavailable exception. No completion record is issued.

## Additional human-authorized integration changes

The human authorized Node version-manager setup and Firefox-only browser checks,
then explicitly authorized the engine health response change in server startup.
`.node-version`, browser config/CI/setup commands, and the stale bootstrap API,
contract, provider-store and browser assertions are updated. The imported
Segment-003 IME test fills its draft before synthetic compositionstart because
Firefox's fill operation can end an existing composition; all assertions remain.

PA fixture duration is eight seconds plus two seconds callback allowance. Ready
NPC assets obtain their real duration from the speech-job registry. Segment-005
must supply real PA assets/durations and review Mandarin audio before claiming
live playback acceptance. No assets or general AI interpretation are fabricated.
