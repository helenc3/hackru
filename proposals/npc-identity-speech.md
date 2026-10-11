# NPC identity and speech integration

The user requested consistent male/female names, clothes and voices for every NPC. Add a shared profile keyed by reviewed city name, without changing manifest schemas. Rendering and dialogue use the same profile. Speech jobs retain a string voice key (`npc:<nameKey>`) resolved by the provider to a human-approved ElevenLabs ID. Legacy role keys still work for harnesses.

Extend SpeechProvider with optional synthesizePcm(text, voiceKey), returning PCM16LE mono at 24 kHz. Existing providers remain compatible; a live conversation needs this capability and reports speech unavailable if absent. The WebSocket event schema stays unchanged. Gemini handles input and dialogue, while ElevenLabs voices the completed reply; suppress model audio. Fixture providers return labeled fixture silence. This trades live model speech latency for approved, identity-consistent speech.
