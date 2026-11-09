# Target architecture v0 — hypothesis, not final specification

Voice interaction must respond quickly and accept interruption, while coding tasks may run for seconds and perform sensitive operations. Separate conversational and work planes allow audio to continue while tasks execute.

```text
Client (Web/PWA or terminal)
  PCM 16/24 kHz, AudioWorklet, AEC/VAD, cancellable playback
                  | local WebSocket / future WebRTC
Local gateway
  turn manager + interruption + event log + shared state
        |                     |                         |
  Streaming STT        Streaming TTS               Agent supervisor
        |                     |                         |
  Transcription       cancellable PCM chunks    harness adapter (OpenCode first)
                                                      |
                                           sandbox + tools + memory + notifications
```

Services bind to `127.0.0.1` by default. The server must not acquire write access outside an explicitly authorized workspace.

The session configuration must carry separate UI locale and spoken-language settings. UI localization is a future requirement; the initial interface is English. The spoken-language setting must select compatible local STT and TTS models and support French without changing the UI locale. Model availability and language switching must be reported accurately rather than inferred from a label.

## Interchangeable components

| Contract | Initial candidate | Alternatives | Rationale |
| --- | --- | --- | --- |
| STT | Local streaming CPU/GPU engine with partial transcripts | Whisper/Parakeet and OpenVINO-exportable engines | Interruption must not depend on the LLM |
| Agentic/vision brain | Quantized multimodal coding model served locally | Qwen code/vision or equivalent with llama.cpp/OpenVINO support | Context, JSON tools, and images within 24 GB |
| TTS | Local streaming engine | Kyutai TTS or another low-first-chunk-latency TTS | Interruptible voice rather than sentence-only output |
| Harness | OpenCode adapter, first candidate | OpenHands or sandboxed shell | Delegate coding work to an existing harness |
| Memory | SQLite + FTS, append-only events | Vector store if evaluation proves a benefit | Portable local audit trail |

## Shared event protocol

Each event carries `event_id`, `session_id`, `turn_id`, `mono_time_ms`, `source`, `kind`, `payload`, and `causation_id`. Key events: `audio.partial`, `stt.partial`, `user.interrupt`, `llm.delta`, `tool.requested`, `tool.started`, `tool.finished`, `tts.chunk`, `tts.cancelled`, and `state.report`.

An interruption creates a new `turn_id`, cancels TTS immediately, marks the preceding LLM stream as stale, and allows a task worker to continue only if its policy permits. Late results are stored and announced in a new turn, never injected into a cancelled response.

## VRAM and system-memory budget: hypothesis H-01

On a 24 GB B60, do not allocate the theoretical total to weights. Reserve 15–25% for buffers, KV cache, runtime, and peaks. Initial targets, to be reconciled and measured together:

| Component | Initial range | Policy |
| --- | ---: | --- |
| Quantized code/vision LLM | 14–17 GB | High priority; initial 16k context |
| LLM KV cache and scratch | 3–4 GB | Controlled through context and concurrency |
| STT + TTS | 2–3 GB | CPU fallback if necessary |
| Runtime/display headroom | At least 3 GB | No second LLM instance |

These upper bounds add up to more than 24 GB; a viable configuration must fit the combined measured peak, not each upper bound independently. Moshi is a reference for full-duplex dynamics and must be tested separately for footprint and actual coexistence.

The 24 GB constraint includes all resident models, projectors, caches and runtime allocations, not merely model file sizes. On the observed Windows desktop, other processes already consume roughly 5.4 GiB of dedicated GPU memory. The actual free headroom must therefore be measured at startup. Treat substantial model-process shared GPU memory as a failed configuration, even if Windows allows it to continue. Record system RAM availability and page-file usage before loading and under sustained concurrent load; a short snapshot or page-file total alone does not establish whether paging was caused by the assistant. Keep a configurable safety reserve and refuse an oversized profile rather than silently relying on system-memory spill. The 27B experiment exceeded this practical limit and is not the current default candidate.

## Portability

- **Intel B60 first:** Linux native is the initial measurement platform; Windows is a distribution scenario. Test llama.cpp/Vulkan and OpenVINO independently.
- **RTX 3090:** evaluate a CUDA backend without changing contracts.
- **AMD:** evaluate Vulkan/ROCm after an Intel proof point.

Intel specifies 24 GB and Windows/Linux support for the B60; this does not establish support for a particular model. Record drivers and runtime versions in each result.
