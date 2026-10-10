# Segment-002 proposal: retire the bootstrap dialogue stub assertion

`apps/server/tests/providers.test.ts` (owned by Segment-000) asserted that the dialogue
provider rejects with 501 `SEGMENT_NOT_IMPLEMENTED` while a dummy `GEMINI_API_KEY` is set.
Once Segment-002 lands, that key makes the real adapter attempt a network call, so the
assertion is both obsolete and unsafe for CI.

Change (two lines): drop the dummy Gemini key from that test and expect the unconfigured
outcome, 503 `PROVIDER_UNAVAILABLE` with `retryable: true`. Speech and session-store stub
assertions are unchanged. No shared interface changes.
