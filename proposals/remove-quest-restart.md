# Remove quest restart

The human requested removal of the Restart quest button and related features.

Remove `retryMission` from shared action contracts, server handling, and client interruption logic. Remove result-panel retry/replay controls. Restrict `startMission` to the next quest after the current quest clears, preventing it from restarting an active or completed quest. Preserve provider/request retries and failed-photo capture recovery.
