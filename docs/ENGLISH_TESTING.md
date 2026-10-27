# English conversation testing

The welcome screen offers **Conversation language → 中文 — Mandarin / English — Testing**. Mandarin is the default. Select English before **Start exploring** to speak or type English and hear English NPC replies. City signs, landmark labels, authored dialogue, hints and verified directions use their English versions. Instructions and controls remain in English.

Language belongs to the server session (`zh` or `en`). Continue Session, quest changes and retry keep it; the selector affects only a new session. Start a new session to change languages. Older session requests and state fixtures without a language continue to use Mandarin. No action or WebSocket parameter can change a session's language.

The quest graphs, coordinates, prices, interaction range, payment, route verification, photo capture and rewards are shared by both languages. English input is accepted by the English evaluator; it remains off-target in Mandarin sessions. The engine authors all factual replies and supplies every direction step from its verified route. Existing multilingual character voices are reused. No additional providers or credentials are introduced.

Live conversation still requires the usual server-side Gemini and ElevenLabs keys. Tests use injected providers or explicitly labelled fixture sessions, never paid services. Fixture examples include:

For offline manual testing, set `ENABLE_DEMO_FIXTURES=true` in your local `.env`, restart development, and select **Fixture demonstration · scripted** plus **English — Testing**. Use **Use typed English** and the fixed phrases below. Recording/transcription and voiced replies still need the existing provider keys.

| Purpose | English fixture phrase |
|---|---|
| Greeting / small talk | Hello. / I am from America. / This is my first visit. |
| Order | I want tea. / I want water. / I want coffee. |
| Price confirmation | Tea 10 yuan. / Water 5 yuan. / Yes. |
| Directions | How do I get to the Shanghai Grand Hotel? |
| Photo | Can you take my photo? |
| Repeat / goodbye | Please say that again. / Goodbye. |

Fixtures recognize only documented examples; live AI supports natural paraphrases. Existing warm-up conversations still happen before an NPC delivers the goal. English verified routes can be longer than Chinese, so NPC reply/history and speech buffers allow up to 2,000 characters; the original Mandarin synthesis limit of 240 characters remains.

`replyZh`, `nameZh` and `textZh` are legacy contract field names. The committed NPC reply uses the session language, while `Directions.textZh` retains its authored Chinese value alongside the existing English steps. Generated manifests and content IDs are never translated or changed.
