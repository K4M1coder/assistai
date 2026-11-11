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

## EXP-087: enrollment choice and thread comparison

Hypothesis: changing from one to two CPU inference threads preserves useful extraction, while enrollment determines which speaker is selected. We extended the local Windows synthetic audio setup with a distinct enrollment utterance by the interfering synthetic voice and replayed the EXP-013 0 dB mixture using `scripts/probe-voxlock-enrollment.py`. No microphone was opened. The Vosk sidecar transcribed the clean speakers, mixture, and three extracted outputs. Transcription is an imperfect proxy for speech quality or speaker separation; there is one synthetic speaker pair, not a population or real-room evaluation.

With the target enrolled, one-thread and two-thread extracted transcripts both matched the clean target transcript. With the other voice enrolled at two threads, the extracted transcript matched that voice's clean transcript. The mixture transcript combined words from both. The same-enrollment output waveforms were close but not bit-identical (maximum absolute sample difference 0.00314, RMS difference 0.000247 on normalized audio). One-thread, two-thread target, and two-thread other extraction took 6.337, 4.001 and 4.028 seconds respectively for 6.918 seconds of audio; each was a single non-isolated burst run. These timings include stream calls and flush, not enrollment or ASR.

The added enrollment WAV SHA-256 is `f01951cb49de5f5657996c55c4270d10d1fd814337b9c0b4e5649ea89daca0f3`; other fixture hashes match EXP-084. This supports continuing evaluation at two threads but does not establish consistent results across environments, speakers, actual speech quality, or resistance to impersonation. Incorrect enrollment can direct the extractor toward someone else; an explicit enrollment procedure, deletion controls and a bypass are needed before integration. Reproduce after the EXP-013 setup by running `.\.venv-voice\Scripts\python.exe scripts/probe-voxlock-enrollment.py` with the Vosk sidecar available.

## EXP-088: extraction with the native turn detector

Hypothesis: the extractor can supply useful audio to the existing 20 ms native turn detector without losing the target phrase in this synthetic example. `scripts/probe-voxlock-turn-pipeline.py` adds one second of silence on either side of the EXP-013 mixture, pushes 20 ms frames through a two-thread extractor, then replays either mixture or extracted output through the existing native energy detector and, separately, energy plus Silero. Captured turns are sent to the existing Vosk sidecar. This runs offline in a burst and opens no microphone. Audio is synthetic and the audio signals are not recorded by this script.

Both detectors emitted one turn in each condition. The unfiltered transcripts combined both synthetic voices; both filtered transcripts matched the clean target transcript reported in EXP-087. Detector start positions were 1160 ms on the mixture and 1280 ms on filtered output; both ended at 7680 ms. These positions reflect the output sample sequence, including filtering effects, and are not measured end-to-end latency. Stream processing and flush took 7.259 s for 8.918 s of audio in this one non-isolated run; enrollment and ASR are excluded. The sample count after truncating flush output matched the input count. No acoustic quality metric or real-time queue measurement was made.

This result supports a carefully bounded integration experiment, not deployment: the existing client receives 20 ms frames, while extraction can delay or buffer samples and may produce variable output sizes. A live implementation must frame output correctly, keep state per session, avoid blocking audio callbacks and the event loop, bound queues, handle overload explicitly, and account for playback gating and cancellation. Real speech, changing speakers, ambient television, clipping and sustained concurrent workloads remain untested. Reproduce after EXP-013 setup and starting Vosk with `$env:PYTHONPATH=(Get-Location).Path; .\.venv-voice\Scripts\python.exe scripts/probe-voxlock-turn-pipeline.py`.

## EXP-089: bounded extraction output framing

`prototype/speaker_extraction.py` is a standalone experimental adapter that converts variable-length float extractor output into 20 ms PCM16 frames. It bounds pending output, rejects non-finite or malformed output, and permanently fails the instance after an extraction error rather than returning raw audio. It does not own a worker, reset a model, flush a stream, enroll a speaker, or integrate with the client. It must be called off the audio callback and event loop. Its bound applies to adapter output, not allocations internal to the inference engine or upstream queues.

Four focused unit tests cover ordered framing, invalid output, output overflow and invalid input; the existing five native turn tests also passed. The `--framer` variant of EXP-088 replayed the same synthetic sample through the real extractor and adapter, native turn detector and Vosk. Both detector modes produced the clean target transcript, while the mixture transcript combined speakers. Extraction and framing took 7.326 s for 8.918 s input, excluding enrollment and ASR. The adapter returned 142080 samples from 142696 input samples: it intentionally did not flush or pad its final partial output. This is a single offline replay and does not prove live timing, cancellation, end-of-stream behavior, quality or resource guarantees. Reproduce with the EXP-088 command plus `--framer`; run unit tests with `.\.venv-voice\Scripts\python.exe -m unittest prototype.test_speaker_extraction prototype.test_native_turn`.

## EXP-090: single-in-flight extraction worker

The standalone `ExtractionWorker` executes the framer on a dedicated thread, accepts one in-flight frame and rejects concurrent submissions rather than building an internal queue. Cancellation or an extraction error invalidates the instance; closing waits for an already-running call and discards its result. Native inference itself cannot be forcibly cancelled, and shutdown can wait if it hangs. The caller must bound upstream capture, handle overload, prevent stale audio after playback or interruption, and replace the stream after cancellation. It is not connected to the microphone client.

Four asynchronous tests cover off-loop execution and concurrent submission, cancellation, model failure and closing during an in-flight call. Together with the framing, turn and client tests, 15 tests passed. The EXP-088 replay using `--worker` recovered the same synthetic target transcript with both detectors; it processed 8.918 s of input in 7.340 s, excluding enrollment and ASR. This is burst replay on one unisolated run, not a sustained real-time or physical-device test. Reproduce with the EXP-088 command plus `--worker`.

## EXP-091: opt-in native client integration

The Windows native client now has an optional explicit enrollment WAV path and uses the two-thread CPU extractor, framing adapter and worker. It permits this path only in speaker-safe mode. The bounded capture queue fails on overflow; captured playback frames and frames from old playback epochs are discarded, and the stream is replaced after playback gating. The WAV is read into memory and never created or deleted by the client. The option is experimental and does not establish identity or automatic interruption.

Using fake devices and an isolated local gateway with volatile SQLite history, one immediate-onset synthetic French question was transcribed only as `secret` and the test failed. With one second of leading silence, one run transcribed `quel est le mot secret` and produced nonzero response audio; a second run with simulated output fed back into the fake microphone also produced that transcript and one response, without a new transcription or interruption. The two successful runs did not open physical devices. The initial clipping was investigated in EXP-092; these isolated examples do not establish reliability, speaker separation in a room, uninterrupted user speech, bounded end-to-end latency or a GPU memory ceiling. No inference models or server configuration were changed in the running demonstration.

## EXP-092: extractor onset warm-up

Hypothesis: the immediate-onset failure occurs inside the freshly initialized extraction stream, before native turn detection. `scripts/probe-speaker-onset.py` uses the same synthetic question and enrollment, transcribing both the complete extracted output and the turn detector's output. Without leading silence, full-output Vosk returned `nos secret` and the turn detector emitted no turn. With 200, 500 or 1000 ms of input silence, both paths returned `quel est le mot secret`. In a separate case, feeding 200 ms of zero samples into a fresh extractor and discarding its immediately available output before the question also produced the complete transcript through both paths. These are single offline examples; decoder variability, model latency and the artificially generated input limit the conclusion.

The experimental native client now primes each new extraction stream with 200 ms of zeros before it processes captured frames. In one synthetic-device test with the question starting immediately, it transcribed the complete question and generated response audio. A separate fake-device run also observed the manual interruption event. Neither test opened physical devices; neither establishes real-room quality, general onset preservation, sustained queue headroom or automatic barge-in. Stream initialization and warm-up occur while the bounded capture queue can fill, which requires further workload testing. Reproduce the offline comparison with `$env:PYTHONPATH=(Get-Location).Path; .\.venv-voice\Scripts\python.exe scripts/probe-speaker-onset.py` after EXP-013 setup and starting Vosk.

## EXP-093: explicit local enrollment recording

`prototype.enroll_speaker` is a separate Windows WASAPI command for intentionally recording a new local 16 kHz mono PCM16 WAV; it captures only when invoked, holds the 3–30 second sample in memory before writing, rejects existing paths, and leaves retention to the user. A write error can leave a partial file. The command does not determine whether the intended speaker is present or whether the recording is suitable for enrollment.

Fake-device tests verified the 3-second WAV format, refusal to overwrite without opening the device, and no output file after capture overflow. These tests did not open physical hardware or evaluate voice quality or recognition. The existing extraction and native client tests were also run; see the prototype README for explicit recording and client commands. No user recording was made during this experiment.

## EXP-094: concurrent extractor and system-memory sampling

Hypothesis: two-thread CPU extraction can run alongside the resident cascade and a simple agent task without the sampled dedicated GPU allocation exceeding the 24 GiB physical budget. We launched three local commands approximately together: a two-thread offline extractor replay with the synthetic mixture repeated five times, an isolated volatile-history gateway test that delegated a read-only fixture task and generated speech, and `scripts/sample-runtime-window.ps1` sampling Windows GPU adapter counters and available physical memory. This does not open a physical microphone. The replay is a burst, not a real-time client; the sampler covers only part of its execution and process overlap is approximate.

The extractor processed 34.592 s of repeated synthetic audio in 21.435 s wall time (RTF 0.620), with p95 29.50 ms per 40 ms chunk and zero simulated backlog. Process CPU time was 36.52 s and peak working set 235 MiB; this is not a whole-system RAM figure. The voice test returned the fixture result `BLUEBIRD` and a spoken notification, with task completion at 8.526 s after test start. Eleven adapter snapshots spanning 15.1 s showed dedicated GPU usage of 15,942,008,832–15,955,656,704 bytes (14.85–14.86 GiB), shared GPU usage of 183,640,064 bytes (175 MiB), and minimum available physical RAM of 7,829,327,872 bytes (7.29 GiB).

The observed dedicated usage stayed below 24 GiB only at those sampled instants. There was no pre-load baseline, no hard allocation limit, no page-fault or SSD I/O attribution, and no guarantee that weights stayed resident. Shared GPU accounting existed throughout; it is not by itself proof of model offload. These observations do not establish the user's no-spill requirement, real-room performance, native speech-to-speech capacity, sustained parallel tasks or concurrency timing at every sample. The sampler reports whole-adapter values and can be reproduced with `.\scripts\sample-runtime-window.ps1 -Adapter 'luid_0x00000000_0x00013269_phys_0' -Seconds 18` on this machine; adapter identifiers are machine-specific.

## EXP-100: investigate LocalVQE for speaker echo

[LocalVQE](https://github.com/localai-org/LocalVQE) is an Apache-2.0 CPU-oriented streaming acoustic echo canceller that consumes microphone audio and the speaker playback reference. Its authors describe 16 kHz processing with 256-sample hops and report a 203K-parameter echo-only v1.4 model plus joint echo/noise variants. Their reported performance and challenge scores are publisher measurements on different hardware, not proof for this machine or room. The separate [EchoFree paper](https://arxiv.org/abs/2508.06271) describes another small AEC design, but the paper alone does not establish an available compatible implementation or weights.

For an offline candidate comparison, the inspected LocalVQE source is pinned to `7f61cd05095d42e56a135b303f5bb4d761da22b9`, its ggml submodule to `c044a8eeae2591faa0950c8b5e514cbc4bbfc4ca`, and the [model repository](https://huggingface.co/LocalAI-io/LocalVQE) to `29ca38495cba9d6393a92a4dd890f28dd81f758d`. `scripts/setup-localvqe-experiment.py` downloads the 2,924,224-byte v1.4-AEC F32 GGUF and verifies SHA-256 `b6e43138588a83bfe903ab5e143b4020b91c1e1629f5a575ac5855ff0003c731`, matching the source allowlist. Only a CPU build is being evaluated; the model is not installed into the product and no GPU allocation is required by the intended CPU configuration. Real playback-reference alignment, drift, output buffering, user-speech preservation, double talk and long-session behavior still require direct measurement.

On this Windows machine, CMake and MinGW built the CPU shared library with two build jobs; the project's configure step applies its tracked ggml patch. `scripts/probe-localvqe-synthetic.py` loaded the haswell CPU backend with one inference thread. In a single offline 12 s synthetic replay, a 150 ms delayed, 0.3-gain copy of the playback signal served as a stationary echo. The echo-only case measured 69.39 dB attenuation over its final four seconds. In a constructed overlap using a reversed synthetic waveform as the near-end signal, the output-to-near correlation within ±100 ms was 0.966 and the norm ratio was 0.924; in near-only input they were 1.000 and 1.001. Per-16 ms-hop p95 was 2.258–2.276 ms across the three cases, excluding model load and device I/O. The input fixture SHA-256 was `de7a02ac447c49526f3ee76336ab6268ee7af389881150042fbe75fe86a612c7`.

This intentionally simple stationary digital path is easier than real speakers and rooms; the reversed waveform is not a natural second speaker. These measurements are not comparable to published challenge scores, and attenuation alone does not establish preserved speech, subjective quality, drift tolerance, actual interruption or a hardware memory ceiling. No microphone, speaker or user recording was accessed. The next experiment should use multiple delays, acoustic paths, real speech and concurrent agent load, then a controlled timestamp-aligned physical-device test before live use.

To reproduce the CPU-only setup on this machine, obtain the pinned source and submodule under `.cache/localvqe-research`, install `huggingface_hub` in `.venv-voice`, and run:

```powershell
git -C .cache/localvqe-research checkout 7f61cd05095d42e56a135b303f5bb4d761da22b9
git -C .cache/localvqe-research submodule update --init --depth 1 ggml/vendor/ggml
cmake -S .cache/localvqe-research/ggml -B .cache/localvqe-research/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLOCALVQE_BUILD_SHARED=ON -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF
cmake --build .cache/localvqe-research/build --target localvqe_shared -j 2
.\.venv-voice\Scripts\python.exe scripts/setup-localvqe-experiment.py
.\.venv-voice\Scripts\python.exe scripts/probe-localvqe-synthetic.py
```

The pinned build expects CMake, Ninja, a C++ compiler and its runtime DLLs; it builds multiple CPU variants on x86. Model and source are research dependencies stored in `.cache`, not shipped binaries.

## EXP-101: synthetic multipath and interruption gate

Hypothesis: the CPU LocalVQE candidate can suppress playback enough for the existing energy detector to avoid false speech starts while preserving a different overlapping voice across plausible delays. `scripts/probe-localvqe-delays.py` uses two different Windows-generated synthetic French voices: repeated far-end speech and a near-end utterance starting at 5 s. A fixed three-tap digital echo has gains 0.25, 0.12 and 0.06 at offsets 0, 23 and 71 ms from the selected base delay. For each delay, separate 15 s echo-only and overlap streams run through fresh one-thread 16 kHz LocalVQE instances; the existing 2.5% energy turn detector then examines filtered output. Vosk transcribes the overlap window. No microphone, speaker or user audio is used.

| Base delay | Echo-only attenuation, final 3 s | Echo-only false starts | Overlap turn starts | Overlap Vosk transcript |
| ---: | ---: | --- | --- | --- |
| 40 ms | 66.30 dB | none | 5.28 s | matches clean near voice |
| 150 ms | 56.20 dB | none | 5.28 s | matches clean near voice |
| 350 ms | 62.12 dB | none | 5.28 s | matches clean near voice |
| 700 ms | 53.35 dB | 1.20 s, 7.08 s | 1.20 s | target phrase plus two extra words |

The near utterance begins at 5.00 s in the constructed signal; detector timestamps are output-sample positions, not live interruption latency. At 700 ms the overlap gate fired before the near utterance, so a live system using this gate could still interrupt itself. Across cases, overlap-to-near waveform correlation within ±100 ms ranged from 0.910 to 0.981; output-to-near norm ratio ranged from 0.956 to 1.068. There were no clipped mixed-input samples. One-thread hop p95 ranged from 2.188 to 2.357 ms on this non-isolated machine. ASR and these simple waveform measures are imperfect proxies for intelligibility and echo quality.

This is one repeated synthetic voice pair and one stationary three-tap path per delay, not real reverberation, a changing room, independent device clocks, music, real microphone speech or a population benchmark. The high final-window attenuation does not prevent early false triggers, as the 700 ms case demonstrates. The model is not enabled in the client; live use requires alignment, overflow behavior, real-device validation and a fallback. Reproduce after EXP-100 setup, EXP-013 synthetic voice setup, and starting the Vosk sidecar:

```powershell
$env:PYTHONPATH=(Get-Location).Path
.\.venv-voice\Scripts\python.exe scripts/probe-localvqe-delays.py
```

## EXP-102: known reference offset in the 700 ms synthetic case

Hypothesis: the EXP-101 false starts at a 700 ms echo delay are sensitive to the relative timing of the playback reference. `scripts/probe-localvqe-alignment.py` repeats the same synthetic three-tap 700 ms path and voice pair, shifting the supplied reference by a known, manually selected amount. This is an oracle-style test: it does not estimate the delay, access physical audio or model independent device clocks.

| Reference shift | Echo-only false starts | First overlap start | Overlap transcript |
| ---: | --- | ---: | --- |
| 0 ms | 1.20 s, 7.08 s | 1.20 s | target plus two extra words |
| 400 ms | none | 5.28 s | matches clean target |
| 500 ms | none | 5.28 s | matches clean target |
| 700 ms | none | 5.28 s | matches clean target |
| 800 ms | 1.56 s, 6.48 s, 12.34 s | 1.56 s | target plus two extra words |

The constructed near voice starts at 5.00 s. These are detector sample positions, not measured live delay. The 400–700 ms offsets helped this single fixed synthetic path, but the over-shifted reference failed; that does not establish a safe universal setting or a reliable estimator. Drift, changing acoustic paths, real double talk, startup transients, queue latency and actual device timestamps remain untested. The model is not enabled for voice interruption. Reproduce with the EXP-101 prerequisites and `.\.venv-voice\Scripts\python.exe scripts/probe-localvqe-alignment.py` with `PYTHONPATH` set to the repository root.

An offline normalized cross-correlation helper in `prototype/reference_delay.py` was also applied to the first four seconds of the 700 ms echo-only case, before the synthetic near voice begins. It estimated 11,200 samples (700 ms) with correlation 0.881 and an alternative-peak ratio of 1.92, above its experimental acceptance thresholds. The replay table still uses manually chosen offsets; the estimate was not fed automatically into the canceller. Four unit tests cover delayed noise, silence, periodic ambiguity and invalid input. The method does not distinguish echo from other correlated audio and is not used in the product; one stationary calibration example does not establish reliability under noise, simultaneous speech, changing paths, drift or physical devices.

## EXP-103: physical-device LocalVQE feasibility probe

Hypothesis: a short, low-volume synthetic playback produces a sufficiently correlated microphone signal to estimate the actual reference delay and compare LocalVQE's output. `scripts/probe-localvqe-physical.py` opens the default Windows WASAPI input and output for nine seconds, plays synthetic speech at 4% sample peak for eight seconds, maps callback timestamps onto the input clock, and processes captured data in memory afterward. It prints aggregate levels and counts only, not speech or raw audio; it does not write captured audio to a file. Operating-system paging and unrelated processes are outside that statement.

In one uncontrolled-room run, the correlation peak was 0.058, below the estimator's 0.25 acceptance threshold; no delay was accepted. With an unshifted reference, microphone RMS was 0.012442 and processed RMS was 0.012294 over the measured five-second interval; both produced one energy-detector start. The source of the captured sound is unknown. These total levels are not isolated echo attenuation, and a detector start is not necessarily a false interruption. Offline LocalVQE p95 was 2.270 ms per 16 ms hop, excluding model load, device capture and queueing. This test did not exercise near-end speech, live AEC, full-duplex interruption, playback audibility, drift or real-time concurrency. It therefore does not establish that LocalVQE works with this device setup.

The first invocation failed before opening a device because `sounddevice` was absent from `.venv-voice`; version 0.5.3 was then installed and the physical run completed. The direct Windows client dependencies are now recorded in `prototype/requirements-native-audio.txt`. Reproduce only when local microphone and speaker use is appropriate, after the EXP-100 setup: set `PYTHONPATH` to the repository root and run `.\.venv-voice\Scripts\python.exe scripts/probe-localvqe-physical.py`. No recording file is produced by this probe.
