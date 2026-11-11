# Noisy-room research: overlapping voices

The user reports TV, music, and other people talking in the same room. They also report the speaker-safe playback mode improved the previous cutouts. Push-to-talk gates audio between turns but cannot separate sounds mixed with the user's speech. The browser requests noise suppression and echo cancellation, but their actual implementation and effectiveness depend on the browser and microphone; these settings are not proof of separation.

## Evidence and distinction

- [Silero VAD's implementation](https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py) scores speech activity in 512-sample windows at 16 kHz and retains context/state. It can improve turn detection, but speech on TV or from another person is still speech. It does not isolate the intended speaker.
- [RNNoise](https://github.com/xiph/rnnoise) provides a local neural noise suppressor, with a 48 kHz PCM reference implementation. It may help non-speech noise; its documentation does not establish suppression of a competing speaker or improvement in French ASR here.
- [SpeakerBeam-SS](https://www.isca-archive.org/interspeech_2024/sato24_interspeech.pdf) studies causal target-speaker extraction using enrollment speech; its reported relative real-time-factor improvement is a result under the paper's conditions, not a measurement on this PC. An implementable checkpoint, license, CPU performance, and streaming integration remain to be verified.
- [WeSep](https://github.com/wenet-e2e/wesep) is an Apache-2.0 toolkit with target-speaker extraction implementations. [Real-TSE baseline](https://github.com/REAL-TSE/wesep-real-tse) describes pretrained inference from a mixture and enrollment recording. Offline-file inference is not evidence of causal streaming. Check the specific checkpoint's license separately and measure its CPU memory, algorithmic latency, and accuracy before integration.

## Experiment EXP-012

Run `.venv-voice/Scripts/python.exe scripts/probe-asr-interference.py` with the local ASR service already running. The script does not record a microphone and reuses the existing ASR model; no GPU model is loaded. The source is the untracked local synthetic French test WAV with SHA-256 `de7a02ac447c49526f3ee76336ab6268ee7af389881150042fbe75fe86a612c7`. It is resampled to 16 kHz, then mixed with a deterministic shifted copy of itself or seeded white noise at 10 and 0 dB whole-clip SNR. Peak scaling prevents clipping. These are stressors, not representative TV, music, a second speaker, or a room impulse response. No clean ground-truth transcript was saved for the original TTS generation, so no WER is claimed.

On the running Windows/Vosk small-French service, the clean result was `bonjour je suis votre assistant vocal local`; shifted-speech 10 dB added words, and 0 dB corrupted the transcript. Both white-noise conditions yielded unrelated text. Processing times for 2.68 s of audio ranged from 1.28 to 2.61 s, but requests were submitted in a burst and the host was concurrently running other services: these are neither streaming latency nor a controlled CPU benchmark. The source and results are a single synthetic example, insufficient to rank models or claim a real-world error rate.

## Next tests

1. Acquire a small consented, diverse French corpus with separate clean speech, competing speech, TV/music, and room recordings; keep recordings local and untracked. Evaluate word error rate and unintended activation separately.
2. Measure the current browser microphone settings and compare close-talking with far-field capture. Compare optional local noise suppression and streaming VAD on identical recordings before enabling them by default.
3. Identify a reproducible licensed causal target-speaker checkpoint and enrollment method. Evaluate separation plus ASR together, clean-speech degradation, voice mismatch, latency, CPU/RAM, GPU/shared-memory and page-file deltas under concurrent voice and agent workloads. Stop if it threatens the 24 GB and RAM budgets.

## Follow-up: quantized target-speaker extraction (EXP-013)

[VoxLock](https://huggingface.co/arbazsiddiqui/voxlock) publishes an Apache-2.0 causal target-speaker extractor, quantized ONNX models, and a streaming Python implementation. The authors report a 24 ms algorithmic delay plus chunking and an RTF of 0.77 for 40 ms chunks on their Xeon setup. Those are external claims under different conditions; its model card identifies English, so French performance needs independent evaluation. Initial enrollment must identify the intended speaker; automatic enrollment can select a TV or another person. We must not treat this as verified speaker authentication.

We pinned model revision `1df3074af3359070ec1c08d9627f3a28d711b9b9`, verified SHA-256 for the enrollment and int8 files with `scripts/setup-voxlock-experiment.py`, and used `voxlock==1.3.0`, `onnxruntime==1.31.1`, one inference thread and 640-sample (40 ms) chunks. The local ONNX Runtime installation has CPU and Azure providers, no GPU provider. The test does not use the microphone or add a GPU model.

`scripts/setup-voxlock-test-audio.ps1` uses installed Microsoft Windows French voices: one target phrase, a different target enrollment phrase, and an interfering speaker. `scripts/probe-voxlock.py` mixes the two utterances at 0 dB whole-clip SNR, streams the mixture through the extractor, and compares Vosk outputs. On one 6.918 s synthetic example, the target and isolated transcripts were identical, while the mixture transcript combined words from both voices. Model load took 240 ms; streamed extraction took 6213 ms wall and 6203 ms process CPU, RTF 0.898. Enrollment time is excluded from the stream timing. The host was not isolated and this is one trial, so the result does not guarantee real-time performance under load, p95 chunk latency, memory headroom, or reliability for the user's voice, music, television, reverberation, and longer sessions. The example's target and interfering voices are synthetic, not real speakers.

The indexed model card for `penta2himajin/tse-conv-tasnet-48k` described a smaller streaming ONNX candidate, but its Hugging Face API returned 401 on 2026-11-10; it was not downloaded or tested. The current [WeSep README](https://github.com/wenet-e2e/wesep) describes its current version as a research preview and states that its local-model CLI and official pretrained packages are under validation; the separately documented Real-TSE checkpoints include causal variants. These constraints prevent assuming a deployable WeSep streaming path.

Reproduce the VoxLock test from the repository root after starting the existing ASR sidecar:

```powershell
.\.venv-voice\Scripts\python.exe -m pip install -r prototype/requirements-voxlock-experiment.txt
.\.venv-voice\Scripts\python.exe scripts/setup-voxlock-experiment.py
./scripts/setup-voxlock-test-audio.ps1
.\.venv-voice\Scripts\python.exe scripts/probe-voxlock.py
```

The audio setup requires the specified Windows voices and produces local untracked WAVs. For integration, build explicit, user-controlled enrollment and a bypass, preserve stream state per session, account for chunk buffering and model warm-up, and compare actual French recordings with and without filtering before enabling it. Measure CPU/RAM peaks and p95 latency while both agent and voice models are active; the measured RTF is close enough to one that overload is a material concern.

## EXP-082: opt-in CPU speech activity detection

Hypothesis: a local speech classifier combined with the existing RMS gate can reduce activation by some non-speech noise without using GPU VRAM. It cannot identify the intended speaker, so television dialogue or another person may still activate it. The [Silero VAD project](https://github.com/snakers4/silero-vad) provides a stateful model and ONNX CPU usage. We installed `silero-vad==6.2.3` without dependencies in an ignored research directory and used its `silero_vad.onnx` (SHA-256 `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3`) with ONNX Runtime's CPU provider and one inference thread. The model uses 512-sample, 32 ms windows at 16 kHz with 64 samples of context. No GPU execution provider was selected.

`scripts/probe-silero-vad.py` compared 217 frames each of two previously generated synthetic French voices, deterministic 5% RMS white noise, synthetic harmonic tones and silence. At probability 0.5, the classifier marked 188 target-voice frames, 152 other-voice frames, and zero noise, tone or silent frames; an RMS threshold of 0.025 marked 134, 132, 216, 216 and zero respectively. These clips do not have frame-level speech labels, so these counts are not recall, specificity or a real-world accuracy benchmark. The other synthetic voice activating the classifier demonstrates that it is not target-speaker suppression. Noise and tones are not representative of music, TV, a real room or multiple speakers.

In this non-isolated run, model initialization took 62.85 ms and per-window inference p95 ranged from 0.1781 to 0.1855 ms; framing, queueing, device capture and pipeline latency are excluded. The experimental Windows native client now offers `--vad silero`: it combines the classifier's probability threshold of 0.5 with its existing adjustable RMS threshold, keeps state per client, uses CPU only and resets classifier state during speaker-safe gating. Energy-only detection remains the default. A synthetic French turn through an isolated real cascade gateway returned the expected transcript, and a synthetic-device native client test also passed. Fourteen component unit tests passed. No live microphone, noisy-room accuracy, real interruption, speech clipping, sustained CPU load or overall latency was measured. The model and gateway test were not exposed to physical audio devices.

## EXP-083: detector and ASR comparison on synthetic mixtures

Hypothesis: adding CPU speech probability to the native RMS detector will reduce early activation by some non-speech backgrounds without necessarily improving the ASR transcript. `scripts/probe-vad-asr-comparison.py` replays the same local synthetic French question, `quel est le mot secret`, with one second of leading background, one second of following background and 0.8 seconds of final silence. It compares the existing 2.5% RMS gate with the same gate plus Silero probability 0.5, then sends the resulting captured turn to the existing Vosk sidecar. Audio is replayed in a burst rather than at wall-clock speed; event times are calculated from sample positions. Each condition uses one short synthetic question; the second voice is another locally generated synthetic French speaker. These are not room recordings, TV, music or a population benchmark.

The clean question was transcribed exactly by both methods. With seeded white noise at 5% RMS, the energy gate activated at 60 ms, before the question began at 1,000 ms; Silero plus RMS activated at 1,360 ms. Both transcripts had 0.8 word error rate against the five-word reference. With synthetic harmonic tones, the energy gate again activated at 60 ms and Silero plus RMS at 1,360 ms; both transcripts matched the reference. With the competing synthetic voice, energy and Silero plus RMS activated at 160 and 180 ms respectively, both before the target question, and both produced word error rate 2.4 against the target reference. Values above 1 are possible when insertions exceed the reference length. The target WAV SHA-256 was `66e82e67764c97d2718ce8f83ead26d262f12bae815c6a0733204cdc30186a40`; the competing WAV SHA-256 was `392524de069b1766cdb7d846d71ef338514dcf10ada6335908e38beb531725ae`.

This is a limited, deterministic example, not an estimate of French ASR quality or real-time latency. The classifier delayed activation for two non-speech backgrounds but did not remove noise from audio already captured, improve the white-noise transcript or select the target voice. Real room recordings, different voices, levels, interruptions and latency measurements remain necessary before changing defaults.

## EXP-084: target-speaker extraction under concurrent work

Hypothesis: CPU-only VoxLock has sufficient latency headroom to extract the enrolled speaker while the voice and agent services work concurrently. `scripts/probe-voxlock-chunks.py` replays the synthetic 0 dB mixture from EXP-013 in 40 ms chunks, measures each streaming call, and simulates a queue whose input arrives every chunk duration. This is an offline burst replay, not an actual microphone, device scheduler or end-to-end latency measurement. The same pinned int8 models and one CPU inference thread were used; the installed ONNX Runtime exposes CPU and Azure providers, not a GPU provider. Each condition is one non-isolated run on this machine, not a statistical benchmark.

| Condition | RTF | Chunk p50 / p95 / maximum | Simulated maximum backlog | Process working set after load |
| --- | ---: | ---: | ---: | ---: |
| Services resident, no test request | 0.918 | 36.37 / 38.05 / 39.55 ms | 0 ms | 230 MiB |
| Concurrent synthetic voice and agent test | 0.953 | 36.96 / 44.39 / 47.38 ms | 92.93 ms | 230 MiB |

The loaded trial launched the extractor and an isolated in-memory cascade gateway test together. The test delegated a read-only fixture task to the existing harness, generated a French voice response while it ran, received `BLUEBIRD`, and produced a spoken notification. The two commands overlapped approximately; this does not establish precisely which inference operations overlapped each measured chunk. Extractor process CPU time was 6.53 s for 6.92 s of audio; process peak working set was 233 MiB and process private commit was 1.65 GiB. These process counters are not whole-system RAM or GPU measurements and do not establish a 24 GB VRAM bound or absence of paging. The test did not capture or store microphone audio.

The loaded p95 exceeded the 40 ms arrival interval and simulated backlog accumulated despite an average RTF below one. This short run cannot predict sustained queue growth or voice quality in a real room. Do not enable extraction by default on this evidence: test longer recordings, real enrolled speakers and overlapping speech, controlled concurrency and actual queue latency, together with whole-system RAM and VRAM monitoring. Enrollment must be explicit and reversible, and extraction must never be treated as speaker authentication. Reproduce the local chunk measurement after the EXP-013 setup with `.\.venv-voice\Scripts\python.exe scripts/probe-voxlock-chunks.py`.

## EXP-086: CPU inference thread comparison

Hypothesis: increasing ONNX inference threads can improve extraction latency enough to reduce backlog, at a measurable CPU cost. We repeated the same 6.918 s synthetic mixture three times as one continuous 20.756 s stream, with the services resident, once per thread count. Stream state persists across repeats; artificial joins do not add acoustic variety. Runs were sequential on a non-isolated host. The probe processes chunks in a burst and simulates a 40 ms arrival schedule, so its backlog is not a live queue measurement.

| Threads | RTF | Chunk p50 / p95 / max | Maximum simulated backlog | Total process CPU | Peak working set |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.056 | 41.00 / 50.68 / 57.25 ms | 1132 ms | 21.84 s | 234 MiB |
| 2 | 0.604 | 22.99 / 29.93 / 37.37 ms | 0 ms | 21.25 s | 234 MiB |
| 4 | 0.480 | 18.58 / 22.74 / 27.84 ms | 0 ms | 26.34 s | 235 MiB |

A further two-thread run started alongside the same isolated in-memory delegation test as EXP-084: RTF was 0.609, p95 29.34 ms, maximum 33.87 ms, simulated maximum backlog 0 ms, and process CPU 21.48 s. The test generated a French response and eventually reported the correct fixture result and a spoken notification. The task completed at 51.25 s after test start, after the extractor had finished its approximately 12.63 s burst; a previous one-thread run completed at 10.56 s. These single, uncontrolled observations do not establish that the thread count caused the task duration or measure fully overlapping end-to-end behavior. Only approximate command-start overlap is known.

Two threads are a promising next experimental setting, not a validated default: the result does not establish quality across speakers, speech preservation, actual scheduling latency, sustained concurrent tasks, system-wide RAM or the VRAM ceiling. Four threads used more total CPU in this limited comparison. Reproduce after the EXP-013 setup with `.\.venv-voice\Scripts\python.exe scripts/probe-voxlock-chunks.py --threads 2 --repeats 3`; accepted thread counts are 1, 2 and 4.
