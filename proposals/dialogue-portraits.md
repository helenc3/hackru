# Dialogue portraits and proximity engagement

Human-approved follow-up to the Lao Wang Figma draft. Current request replaces numeric patience with three visible meters: **Mood, Clarity, Courtesy**.

The public interactable gains an optional `nameKey`, copied from the committed world anchor, so artwork follows character identity instead of role or translated display text. Older in-memory sessions can use the exact reviewed 老王 label as a compatibility fallback. No patience field or rules change is introduced. Other NPCs retain dialogue without Lao Wang's portrait.

The dialogue dock uses real world rendering behind a transparent portrait. There is no screenshot backdrop in the implementation. Transcript-off hides dialogue/coaching text while keeping the three requested meters; unavailable Clarity/Courtesy scores are explicitly unscored until an evaluated reply. Mood is an ordinal visual representation of the existing server mood, with an accessible text equivalent, not a fabricated numeric patience score.

Warm/neutral use happy artwork, terse uses restrained angry artwork, disengaged uses sad artwork. The client does not infer feelings from the player's voice/camera. Mouth shapes follow only NPC output audio, sampled at 10 Hz; idle/silence/blocked/muted batch playback closes the mouth, and reduced motion uses closed mouth. This is amplitude-based talking animation, not phoneme alignment. Live playback is observed in the existing output graph; clip playback uses an asynchronously decoded envelope without rerouting or delaying audio.

NPCs within the existing 2 m interaction radius engage automatically, with position flushed to the authoritative server before the existing callback opens voice. Entering a conversation latches nearby NPCs until the player walks at least 2.75 m away. Closing, saying goodbye, or dismissing a summary therefore never immediately reopens another conversation. E remains available to explicitly talk again or activate an object; proximity never pays or completes an objective. Recovery, settings and other blocking panels suppress auto-engagement.

Automatic greetings recheck HUD visibility and keyboard focus after position sync completes. Opening the dictionary or another HUD control during that request defers the greeting without latching the NPC; it can resume after focus returns to the world. The dictionary's `/` shortcut also works from non-editable conversation controls, and a new dialogue panel does not take focus from an already open HUD dialog.

Movement samples use a conservative pacing budget from the previous server acknowledgement, leaving part of the server's jitter allowance in reserve. This prevents rendering or request queues from bunching otherwise valid movement into a rejected speed burst; the server's authored speed and proximity rules remain authoritative.

Lao Wang's generated world figure uses his identity's mustard vest and cream sleeves instead of the generic pink apron; unrelated vendors keep their outfits. Nine original transparent PNGs are loaded on engagement. Artwork is about 12 MB uncompressed PNG transfer across all nine variants, cached by the browser; first entry holds a closed mouth until preloading finishes to avoid flashing unloaded animation frames.
