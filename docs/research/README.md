# Research notebook — local voice assistant

This directory records the product's research. Never overwrite an experiment: give it an identifier, a falsifiable hypothesis, the exact configuration, raw measurements, and a conclusion. Negative results are valuable too.

## Objective

Build a local, interruptible, real-time personal assistant that can speak and listen concurrently, delegate reasoning, coding, and actions to an agent harness, and share memory between voice, tools, and UI. The first target is an Intel Arc Pro B60 with 24 GB, followed by RTX 3090 and AMD.

The existing React demo is a client mockup and integration test bed, not an implementation of this objective.

## Ongoing documentation requirement

Keep the root [README](../../README.md), [architecture](../ARCHITECTURE.md), and [RBAC](../RBAC.md) current as research, experiments and implementation evolve. Distinguish observed behavior, research-only prototypes, assumptions and unverified security or hardware properties. Commit completed checkpoints regularly as K4M1coder. This requirement supplements the ongoing research and working-prototype objective.

## Language requirements

Code, identifiers, comments, documentation, and the initial UI are written in English. The UI should eventually support multiple display languages. Spoken language is a separate user setting: users must be able to select French for both speech recognition and speech generation, independently of the UI language. The current cascade uses French recognition and generation, but language selection, broad French quality and live native-speech behavior remain incomplete or unverified.

## Evidence rules

1. Claims of compatibility, real-time performance, or local operation require reproducible results in `experiments.jsonl`.
2. Measure voice latency, time to first model action, VRAM, interruption quality, and tool success separately.
3. Record driver, runtime, commit, OS, model, quantization, context, and complete command.
4. Keep sensitive test audio and logs out of Git; record only hashes and aggregate metrics.
5. Start each architectural change with a new hypothesis rather than rewriting previous results.

## Documents

- [Target architecture](target-architecture.md): initial choices and component boundaries.
- [Hypotheses](hypotheses.md): hypotheses, tests, and decision criteria.
- [Experiment log](experiments.jsonl): append-only record of experiments.
- [Benchmark protocol](bench-protocol.md): common Windows/Linux measurement protocol.
- [Source review, 2026-11-09](2026-11-09-source-review.md): published implementations and local hardware findings.
- [Noisy-room research](2026-11-10-noisy-room.md): interfering speech, target-speaker extraction, and a controlled ASR stress test.
- [Playback-reference echo research](2026-11-10-echo-reference.md): AEC3 and a synthetic echo-path experiment.
- [Windows Vulkan memory comparison](2026-11-10-vulkan-memory.md): measured load-mode and host-buffer experiments.
- [Native duplex feasibility](2026-11-10-native-duplex.md): current candidates, language constraints and a B60 build check.

## Initial decision (historical)

The first useful prototype will use a streaming VAD/STT → agentic LLM → TTS pipeline with independent interruption handling. A unified speech-to-speech model remains a research candidate and comparator: it competes for VRAM with the code/vision model and its Arc B60 portability remains unverified. The agent interface should use structured text to control an existing coding harness reliably.

Subsequent native LFM3-Audio trials ran synthetic speech and delegation on this B60, but have not established robust French conversation, real-room interruption or a hard memory budget. See the later experiments rather than treating the initial decision as the current conclusion. EXP-068 through EXP-080 investigate a native timestamp-aware AEC comparator and an experimental Windows client; synthetic loopback exposed self-interruption, and physical synthetic-question tests did not recognize the expected question. EXP-081 tests conservative concurrent task admission with mock providers; actual memory is not reserved. EXP-082 and EXP-083 evaluate an optional CPU speech-activity classifier on synthetic signals; it is not target-speaker isolation. Volatile gateway history is available for isolated tests.

EXP-084 through EXP-107 cover CPU target-speaker extraction, user-reported manual interruption, native-client mock integration, bounded session context, opt-in session resume and LocalVQE echo research. The index records their principal measurements and points to the detailed notes; physical LocalVQE probes have not demonstrated reliable echo cancellation. Neither native full-duplex voice nor the no-spill memory requirement is established.

[EXP-180](2026-11-13-resumption-preflight.md) records the current service inventory, resource guard failure, controlled failure-path tests and the remaining physical French demonstration. Existing gateway health is not proof of a functioning audio conversation.

[EXP-182](2026-11-14-current-gateway.md) records a new current-source gateway started after the operator freed memory, and the proposed physical test; startup is not an end-to-end result.

[EXP-183](2026-11-14-physical-and-asr-failure.md) records the operator's physical French conversation and mixed interruption reports, plus an isolated actual ASR connection refusal.

[EXP-184](2026-11-14-spoken-coding-followup.md) records a guarded synthetic coding trial that edited its fixture but failed its delegated-filename assertion, plus a fix to its transcript measurement.

[EXP-185](2026-11-14-spoken-coding-repeat.md) verifies that measurement fix with real models and records a repeated delegated-identifier failure.

[EXP-186](2026-11-14-task-approval.md) records the new explicit approval flow, real-controller decline and mock-backed enforcement tests.

[EXP-194](2026-11-14-aec-detector-replay.md) replays synthetic echo-filter outputs through an approximate speech-onset rule; it does not establish real-room interruption performance.

[EXP-195](2026-11-14-agent-status-context.md) preserves uncertain task monitoring state in bounded session context and records monitoring recovery.

[EXP-196](2026-11-14-asr-reset-order.md) tests a late ASR segment across a reset acknowledgement and prevents it from contaminating the next reviewed utterance.

[EXP-197](2026-11-14-notification-lookup.md) tests session-scoped notification lookup after later progress events displace a completion from bounded prompt context.

[EXP-198](2026-11-14-current-demo-18096.md) records a current-source cascade endpoint and a synthetic browser speech-review check; physical conversation and the hardware budget remain unverified.

[EXP-199](2026-11-14-audio-cpp-native-comparison.md) reviews an alternative LFM3-Audio runtime against French conversation, tool calls, duplex behavior and the memory budget; it was not run locally.

[EXP-200](2026-11-14-native-disconnect.md) covers recovery signaling when an experimental native speech backend unexpectedly closes.

[EXP-201](2026-11-14-service-url-redaction.md) checks redaction of credentials embedded in service-discovery addresses.

[EXP-202](2026-11-14-haru-native-candidate.md) evaluates Haru-4B as an untested French full-duplex candidate and records its tool-use, Intel and memory uncertainties.

[EXP-203](2026-11-14-voicechat-gguf-fork.md) reviews a community GGUF VoiceChat implementation, including its documented language and tool-call limitations.

[EXP-204](2026-11-14-nemo-speech-official-voicechat.md) inspects NVIDIA's official VoiceChat runtime, its tool-result protocol, CUDA-focused guide, French limitations and source-level audio handling.

[EXP-205](2026-11-14-gradium-phonon-tts.md) evaluates a small local French TTS comparator, its access conditions and the installed Windows CPU runtime; no French model has been tested.

[Resumption 2026-11-15](2026-11-15-resumption.md) records demonstration acceptance criteria, unavailable inference services, restoration of the two local speech services and a synthetic loopback.
