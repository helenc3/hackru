# Audio experiments and benchmarks

This directory contains historical Mandarin voice comparisons and live provider latency tests. Recordings, exact inputs, voice identities, generation metadata, transcripts, timings and failure records are retained. These are experiments, not production game assets.

## Contents

| Location | Contents |
|---|---|
| [index.html](index.html) | Listening page for the 60 retained harbor-change samples: 20 voices × one line × three text representations. |
| `b1.harbor-change.tier-1/` | Original voice-comparison MP3s, named `<voice-name>-<voice-id>_<option>.mp3`. |
| [voices.json](voices.json) | Voice identities, accent labels and annual usage ranking retrieved on 2026-10-10. |
| [inputs.json](inputs.json) | Exact Hanzi, pinyin and IPA inputs for the original comparison. |
| [manifest.json](manifest.json) | Generation settings, status, byte counts, hashes and timings for those samples. |
| [latency/](latency/README.md) | Gemini Live vs ElevenAgents tests, eight short/long conversational examples, regular TTS tests, and the quota-blocked Gemini → TTS benchmark. |
| `generate.js`, `build-index.js`, `convert-inputs.py` | Original comparison generation, listening-page build and historical input conversion scripts. |

## Voice review

The human reviewed all 120 original samples; the 60 platform-change samples were subsequently removed from this folder at their request; the [approved Mandarin voice table](../docs/MANDARIN_VOICES.md) records the outcome and current assignments. **Use authored Simplified Chinese directly for future synthesis. IPA was rejected and must not be reused.** Historical pinyin and IPA samples remain as review evidence.

The voice comparison used `eleven_v4`, `language_code=zh`, and `mp3_44100_128`. Library popularity and accent labels do not certify standard Mandarin, and approval on these lines does not separately certify other models or arbitrary dialogue.

The conversational ElevenAgents benchmarks used **Sarah**, outside the approved Mandarin list. Their generated short/long inputs used **George**, also outside that list. The current TTS benchmark used approved **James Gao** with `eleven_v4_turbo`. Gemini Live voices were not explicitly selected. These comparisons therefore differ in voices and reasoning models; they do not isolate voice synthesis quality.

## Reproducing the original comparison

From the project root:

```sh
node --env-file-if-exists=.env audio_test/generate.js
node audio_test/build-index.js
```

Generation uses the configured ElevenLabs key and provider credits. Successful existing generations are skipped; failures are recorded without credentials or provider messages. Quota/permission failures stop the batch. It never purchases credits or changes subscriptions.

`convert-inputs.py` documents the historical conversion with pypinyin 0.55.0 and dragonmapper 0.3.0. It applies contextual tone sandhi for 不 before 是/再 and 一 before 号; other third tones retain lexical markings. Connected-speech realizations vary. Retain these inputs as provenance, rather than using pinyin/IPA for new game audio.

Latency reproduction commands and measurement definitions are in [latency/README.md](latency/README.md). No keys are stored here. Benchmark commands make live requests; viewing saved recordings does not.

References: [voice ranking API](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared), [ElevenLabs IPA reference](https://elevenlabs.io/blog/pronunciation-dictionary-guide), [Mandarin transcription conventions](https://courses.washington.edu/chin342/ipa/about.html).
