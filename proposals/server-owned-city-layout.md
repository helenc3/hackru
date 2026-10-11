# Server-owned city layouts

Requested by the human: keep city layout data server-side and stream it as needed, with the same lifetime as quest progress, location, and inventory.

The existing world service already owns immutable committed manifests in a process-local map and returns cache hits through the session chunk route. The client now requests those chunks directly on entry and reload, rather than persisting manifests in IndexedDB and uploading them on startup. Browser storage retains only identifiers and mission review results. New-city selection forgets the remembered world identifier.

No shared schema changes. The existing restore endpoint remains available for contract compatibility, but normal gameplay never calls it. This supersedes the browser terrain persistence requirement in CITY_GENERATION section 9. Server restarts clear layouts along with sessions; durable disk/cloud saves are outside this change.
