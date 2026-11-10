# Research notebook — local voice assistant

This directory records the product's research. Never overwrite an experiment: give it an identifier, a falsifiable hypothesis, the exact configuration, raw measurements, and a conclusion. Negative results are valuable too.

## Objective

Build a local, interruptible, real-time personal assistant that can speak and listen concurrently, delegate reasoning, coding, and actions to an agent harness, and share memory between voice, tools, and UI. The first target is an Intel Arc Pro B60 with 24 GB, followed by RTX 3090 and AMD.

The existing React demo is a client mockup and integration test bed, not an implementation of this objective.

## Ongoing documentation requirement

Keep the root [README](../../README.md), [architecture](../ARCHITECTURE.md), and [RBAC](../RBAC.md) current as research, experiments and implementation evolve. Distinguish observed behavior, research-only prototypes, assumptions and unverified security or hardware properties. Commit completed checkpoints regularly as K4M1coder. This requirement supplements the ongoing research and working-prototype objective.

## Language requirements

Code, identifiers, comments, documentation, and the initial UI are written in English. The UI should eventually support multiple display languages. Spoken language is a separate user setting: users must be able to select French for both speech recognition and speech generation, independently of the UI language. The first voice implementation must validate French recognition and generated speech with local models; the current demo does not yet provide this capability.

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

## Initial decision

The first useful prototype will use a streaming VAD/STT → agentic LLM → TTS pipeline with independent interruption handling. A unified speech-to-speech model remains a research candidate and comparator: it competes for VRAM with the code/vision model and its Arc B60 portability remains unverified. The agent interface should use structured text to control an existing coding harness reliably.
