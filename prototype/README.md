# Experimental local voice components

These components are an early implementation, not the complete assistant. The React web UI is a separate mockup. The gateway serves its own experimental browser client, which has been exercised interactively; live interruption and echo handling remain incomplete.

## French speech recognition

Create a Python 3.11 or 3.12 environment, install the pinned direct dependencies in `requirements.txt`, then run `python scripts/setup-vosk-fr.py` from the repository root. This downloads the public Vosk French small model into `.cache/vosk`. After setup, the recognizer runs locally without network access. Set `ASSISTAI_VOSK_MODEL` to use a different Vosk model directory.

From the repository root, start `python -m uvicorn prototype.asr_server:app --host 127.0.0.1 --port 18082`. `GET /health` reports readiness. The `/asr` WebSocket accepts binary mono 16 kHz little-endian PCM16 frames of at most one second. It emits JSON `partial` and `segment` events while audio arrives. Send `{"type":"end"}` to receive a `final` event and reset the recognizer, or `{"type":"reset"}` to discard the current utterance. Clients must collect `segment` events as well as the final text for longer utterances.

`python scripts/test-asr-sidecar.py path/to/mono.wav` resamples a 16-bit mono WAV and replays it at real-time speed. With no argument, it expects `.cache/french-test.wav`, produced by the Pocket TTS experiment. This is an integration probe, not a benchmark of real microphones, accents, noise, or word error rate.

## Limitations

The experimental browser client has been exercised with a live microphone, but sustained performance, accurate interruption and noisy-room behavior remain unverified. There is no authentication or enforced resource policy yet. Bind the sidecar to loopback and avoid exposing it to the network. Vosk's small French model is a baseline, not the final model choice; compare it against Kyutai STT and other candidates with an authorized corpus.

`gateway.mjs` is a separate experimental integration of the sidecar, a local OpenAI-compatible model server, and a local Pocket TTS server. It serves an experimental browser client at `http://127.0.0.1:18083/`, accepts text or PCM through `/voice`, and writes conversation events to `.cache/assistant/events.sqlite`. Optionally, `ASSISTAI_OPENCODE_URL` enables background delegation to a separately configured OpenCode server. Task completion is emitted as an event; the experimental browser queues a spoken notification when idle. OpenCode's own permissions apply: the gateway is **not** a sandbox. It must not be exposed to the network. Its short synthetic-audio test is `scripts/test-voice-gateway.py`; `scripts/test-gateway-delegation.mjs` exercises a read-only fixture. Neither test establishes live microphone performance or sustained hardware-budget compliance.

The client defaults to **speaker-safe mode**: it pauses microphone input while generated speech is playing to prevent acoustic feedback. Use the Interrupt button to stop the assistant and reopen the microphone. Uncheck the setting to experiment with automatic spoken interruptions; echo and false interruptions are not yet solved in that mode.

On Windows, `scripts/measure-windows-memory.ps1 -ModelPid <pid>` samples dedicated and shared GPU allocations, model process memory, available physical RAM and global page-file use. Establish a baseline before starting services and compare it with sustained audio, vision and agent workloads. This is monitoring, not an automatic memory limiter.

`resource-budget.mjs` contains a fail-closed admission policy for measured dedicated GPU memory, shared-memory growth and system RAM reserves. `notification-queue.mjs` serializes spoken notifications and defers them when a user interrupts. The resource policy is **not wired into the gateway** and does not currently enforce limits. The gateway and browser implement a separate experimental task-notification flow; its behavior under interruption and load still needs validation. The GPU limit must be set from actual adapter availability, not just the nominal card size. Shared-memory counters and global page-file use are warning signals, not definitive proof of the cause of an allocation or a disk access.

## Experimental LFM realtime gateway

Set `ASSISTAI_LFM_REALTIME_URL` to a loopback `/v1/realtime` WebSocket endpoint to opt into the LFM bridge; without it, the existing cascade remains the default. `ASSISTAI_LFM_WORKSPACE_CONTEXT` can provide a short explicit workspace description. This is an experimental developer path, not an automatic model launcher or enforced memory policy. The browser has not yet been tested live in this mode; text and image input are unavailable, and spoken completion notifications pass a mock-server integration test but have not been verified with the real model. OpenCode retains its own permissions and is not an OS sandbox. See [EXP-054](../docs/research/2026-11-10-native-duplex.md#exp-054-opt-in-lfm-gateway-and-synthetic-interruption) for conditions and limits.
