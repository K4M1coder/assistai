# EXP-138: Speech text normalization and spoken image input

## Observation and hypothesis

The user reported that French speech is sometimes unintelligible and that task announcements can sound like markup or special characters. The live local Pocket TTS process uses `--language french`; Kyutai's [model documentation](https://github.com/kyutai-labs/pocket-tts) describes language-specific models. Language selection alone does not establish intelligibility. The prior gateway passed result excerpts and assistant answers directly to TTS, including markup and code.

## Intervention and evidence

A speech-only text projection removes common Markdown, HTML and emoji, and substitutes short French cues for code and URLs. The original answer remains in the conversation; the projection intentionally omits detail and is not a semantic summary. Notification truncation avoids splitting a word when a suitable boundary exists. Thirteen targeted JavaScript tests and one Python test passed, including a mock full gateway request pairing an ASR transcript and a selected image with the vision endpoint.

One guarded local loopback used a synthetic result containing a Markdown heading, bold text and a fenced code block. Pocket TTS generated 316,800 bytes of 24 kHz audio; independent local Vosk recognized the marker `rouge` and transcribed the code cue. No physical devices were opened and audio was not heard. This single observation cannot establish audible quality, general pronunciation, accurate reading of arbitrary text or eliminate TTS model errors.

The cascade now accepts a user-selected image along with a spoken question when the gateway advertises support. That separate change has mock coverage only; live microphone and vision behavior are unverified. The native bridge does not support image input.

## Next step

Ask the user to compare the updated local demo with Speaker-safe enabled. If articulation remains poor for plain French sentences, compare French TTS models and voices under the CPU/RAM and latency budget using a small consented listening set. Do not treat ASR recognition alone as a listening-quality metric.
