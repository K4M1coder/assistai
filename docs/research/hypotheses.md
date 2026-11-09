# Hypotheses and decisions

| ID | Falsifiable hypothesis | Test | Success criterion | Status |
| --- | --- | --- | --- | --- |
| H-01 | A modular pipeline fits sustainably on a 24 GB B60 with a useful code/vision LLM. | 30-minute conversation, coding task, and image with increasing context. | No OOM, P95 VRAM < 22 GB, no latency drift. | Planned |
| H-02 | Local barge-in stops audible output in under 150 ms. | Inject 100 interruptions during playback. | P95 audio stop < 150 ms; no cancelled TTS chunk audible afterward. | Planned |
| H-03 | The agent controls a coding harness without implicit system access. | Repository tasks in a sandbox plus denied actions. | Measured task success; 100% of actions outside the allowlist denied. | Planned |
| H-04 | Streaming delivers first speech in under one second without degrading tool use. | 50 short French turns, cold and warm. | P50 < 1 s, P95 < 1.5 s, valid structured tool calls. | Planned |
| H-05 | A unified full-duplex model provides a perceptible gain that justifies VRAM and porting costs. | Same script with Moshi/unified reference versus H-04. | Measured interruption improvement without invalidating H-01. | Planned |
| H-06 | The local voice pipeline supports French recognition and speech generation while the UI remains in English. | Select French for a voice session; run the French corpus through STT and TTS with the UI set to English. | Recognized text and audible output are French; language selection does not change the UI; quality and latency are recorded. | Planned |

## Experiment order

1. Build the gateway and event protocol with explicitly labeled mock adapters.
2. Replace STT and TTS with local engines; measure H-02 and H-04.
3. Add the agentic/vision LLM and an OpenCode adapter in a sandbox; measure H-01 and H-03.
4. Replay the corpus on Windows, RTX 3090, and AMD.
5. Compare native speech-to-speech engines such as Moshi or VoiceChat using the same corpus.

Gemini and Gradium are useful UX and orchestration references, but their remote services do not meet the local-only requirement. Enterprise RBAC, SaaS connectors, and simulated telemetry are outside the initial MVP. The demo's 256K context must not be presented as measured capacity.
