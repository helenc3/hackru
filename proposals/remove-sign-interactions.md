# Remove sign interactions

Requested by the human: disable nearby sign interaction and remove its code.

Remove the `inspect` game action, public sign interactables and their `cueId`, public `visibleCues`, and internal `inspectedTargetIds`. Signs are no longer projected as interactables, opened in an overlay, or used to grant reading evidence. Existing sign anchors and authored sign text remain scenery in committed city manifests. Clients and fixtures must use the revised action/state schema together; old inspection requests are rejected by schema validation.
