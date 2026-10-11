# Proposal: `farewell` intent and `conversationEnded` turn flag

Additive change to the frozen contracts.

- `IntentSchema` gains `farewell` (no slots). Every NPC allows it.
- `TurnResponse` and `EngineResult` gain optional `conversationEnded: true`.
- Engine: a successful Mandarin farewell ends the conversation. At `p1.receipt` with a confirmed price it applies the `p1.pay-cafe` transition through the same guards as the choice, so saying goodbye at the counter pays. Elsewhere, including the boss, it progresses nothing.
- Clients close the dialogue after the goodbye reply plays; the live relay closes the socket with reason `farewell` once the spoken goodbye completes (4 s cap).
