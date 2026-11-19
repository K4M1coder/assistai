# Mochi Voice & Agent Harness

> Status: **experimental local voice prototype and separate interface mockup**. The local prototype supports a French speech cascade and limited agent delegation; native speech-to-speech remains research. See the [research notebook](docs/research/README.md) for evidence and experiment history.

This repository contains two separate interfaces. The React web/PWA interface is a mockup with simulated harness, telemetry, connectors and RBAC. The experimental local voice client is served by `prototype/gateway.mjs` and uses local inference services. See [architecture](docs/ARCHITECTURE.md) and [RBAC](docs/RBAC.md).

The initial interface and project code are in English; a multilingual UI is planned. Spoken language will be configured independently, including French speech recognition and generation. French recognition and generation are available in the experimental cascade; quality and full-duplex behavior remain under evaluation.

## Current local voice prototype

The experimental client uses Vosk French recognition, an LFM3 text voice controller served by llama.cpp, and Kyutai Pocket TTS. A separate Gemma model handles image questions and the configured OpenCode server uses a disposable editable fixture. This is a cascade, not native speech-to-speech; the browser shows the configured service and model names. The current gateway is at [http://127.0.0.1:18131/](http://127.0.0.1:18131/) while its local services run. See the [resumption record](docs/research/2026-11-15-resumption.md) for startup history, observed results and demonstration criteria; service readiness alone does not establish a successful voice or agent session.

On the latest resumption preflight, service health checks passed but system resource readings exceeded the existing trial guard. Physical French conversation and audible playback were not tested in that preflight. Existing gateway processes may run older source. See [EXP-180](docs/research/2026-11-13-resumption-preflight.md) before starting a new trial or interpreting health as end-to-end readiness.

An earlier gateway was started on port 18094 with volatile history and existing local services. Its startup and physical test procedure are documented in [EXP-182](docs/research/2026-11-14-current-gateway.md). That gateway has since been stopped.

In a subsequent physical trial, the operator reported a correct or corrected French transcript and an audible, relevant French response. Manual interruption initially failed by report but stopped speech on a repeat; the first failure is unexplained. An isolated refused ASR connection produced an explicit error and disconnect. These observations are limited; see [EXP-183](docs/research/2026-11-14-physical-and-asr-failure.md).

A guarded synthetic spoken coding trial changed the disposable fixture and generated notification audio, but failed because recognition and delegation misstated the requested filename and function. It does not establish reliable coding delegation; see [EXP-184](docs/research/2026-11-14-spoken-coding-followup.md).

The corrected measurement was verified in a second real-model synthetic trial, which again delegated incorrect identifiers despite editing the fixture. See [EXP-185](docs/research/2026-11-14-spoken-coding-repeat.md).

The gateway submits delegated tasks directly to the configured OpenCode harness. The editable demonstration uses a disposable workspace; its rules are not an OS sandbox and the gateway is not authenticated.

Speaker-safe mode prevents voice interruption during playback; the Interrupt button remains available. Hold-to-talk and the experimental playback-reference echo filter can be combined with other settings. The filter has not been validated as effective for speakers; false self-interruptions were reported. The noise detection slider controls the microphone threshold.

The browser can select an available microphone or virtual input; changing it takes effect after restarting microphone capture. Selection and restart passed a synthetic browser-device test; physical and virtual devices remain unverified. A possible system-reference echo-cancellation tool was compared offline on one synthetic path but is not installed or validated in a room. See [EXP-191](docs/research/2026-11-14-echoless.md), [EXP-192](docs/research/2026-11-14-microphone-selector-browser.md) and [EXP-193](docs/research/2026-11-14-echoless-offline.md).

In automatic detection mode, the browser keeps a bounded 200 ms pre-roll locally and starts sending it to recognition only when the threshold detects speech. This avoids accumulating unlimited below-threshold background audio, but cannot distinguish the user from a television or another person above the threshold. Push-to-talk remains the more controlled option in noisy rooms. This change has a simulated browser-frame test; physical recognition and barge-in need further testing.

The **Pause before sending** slider sets how long automatic detection waits after quiet audio; its default is 1.4 seconds. A longer pause can prevent sentence splitting but adds response latency. Push-to-talk sends when released and does not use this setting.

A headless Chrome test also sent synthetic French audio through the browser capture path and local Vosk into transcript review without submitting a turn; see [EXP-166](docs/research/2026-11-13-browser-synthetic-audio.md).

A single synthetic competing-voice test produced an extra word despite retaining most of the French question. Transcript review is useful for correcting such errors, but the browser path does not yet isolate the user's voice. See [EXP-168](docs/research/2026-11-13-browser-voice-interference.md).

The CPU target-speaker extractor was also evaluated on that mixture with two different synthetic enrollments. The negative control still contained much of the French target phrase, so this does not establish reliable speaker selection; it remains outside the browser demo. See [EXP-169](docs/research/2026-11-13-extractor-browser-mixture.md).

Source-correlation measurements suggest some competing-voice attenuation with the intended synthetic enrollment, but the competing enrollment still retained substantial target-source content. See [EXP-170](docs/research/2026-11-13-extractor-correlation.md).

A headless Chrome smoke test confirmed that Speaker-safe, push-to-talk and the experimental echo-filter controls can be selected together, and that service names are displayed. It did not test microphone audio or filter effectiveness. See [EXP-164](docs/research/2026-11-13-browser-controls.md).

Research prototypes separately tested MiniCPM-o and LFM3-Audio native speech paths, synthetic French delegation through a read-only fixture, and explicit cancellation. An opt-in LFM realtime gateway path now exists, but the running demonstration still uses the cascade; the new path has synthetic and mock-server integration tests, including a real-model synthetic completion notification. The 24 GB budget, full-duplex interruption, French native speech quality, sustained workloads and no memory spill are not yet proven. See [native duplex experiments](docs/research/2026-11-10-native-duplex.md) and [local prototype details](prototype/README.md).

The Windows audio client has also been exercised against the native gateway using simulated devices and a mock inference server, including one manual-interruption and late-audio test. The client prints whether the gateway reports cascade or native speech mode. In native mode, the web service list identifies a configured parallel transcription engine separately from the speech-to-speech model; a physical-device test against the real native speech model remains outstanding.

An optional sampled resource check can reject new background tasks when measured headroom is insufficient. It accounts conservatively for estimated concurrent tasks within one gateway process, but does not reserve memory or enforce a GPU ceiling.

An experimental, disabled-by-default `-CancelOnPressure` Windows launcher option can request cancellation of a running agent task after consecutive low-resource samples. It is reactive, cannot guarantee cancellation or prevent memory overshoot, and has only been exercised with simulated resources and harness responses.

LFM3-Omni-2B is an additional native audio-and-vision research candidate. A guarded Windows trial loaded its Q4 weights with Q8 or F16 projector and returned correct text for a synthetic French question, but generated audio was often short or did not match that text in independent ASR checks. Full-duplex, intelligible speech and concurrent agent tasks remain unverified. See the [candidate notes](docs/research/2026-11-17-lfm3-omni-candidate.md).

An interrupted native-mode agent trial exposed a fabricated spoken task result. The updated gateway no longer generates free-form task-result summaries: results are displayed, and spoken notifications require the separately configured local TTS service. This mitigation does not validate the agent's answer or guarantee pronunciation. Existing gateway processes must be restarted to use it.

The operator has reported one successfully approved read of the disposable `calculator.py` fixture and confirmed hearing an understandable result. This used typed input and does not establish a completed voice-input or edit demonstration. See the [fixture notes](docs/research/2026-11-17-edit-fixture.md).

The earlier approval-based experiment and operator report remain documented in the [investigation](docs/research/2026-11-17-reported-premature-task.md). The approval gate was subsequently removed at the operator's request.

The current editable-fixture demonstration is available at `http://127.0.0.1:18131/` while the owned services remain running. Delegated tasks start directly. The prior demonstration gateways were stopped after checking for active clients; their volatile histories were discarded.

The separate mockup runs with `npm run dev` at `http://localhost:3000/`. For a lower-memory static server, run `npm run build` and `npm run start:mockup`. The page identifies itself as a mockup and links to the experimental local voice client; its example actions and telemetry are not proof of real execution. On Windows, stop any owned OpenCode harness before `npm ci` so its executable is not locked. The mockup and local voice gateway are separate systems. See [direct delegation and audio tests](docs/research/2026-11-17-direct-delegation-audio-loopback.md).

A second synthetic spoken-image check on the running cascade returned the expected blue color and produced audio. It did not use a physical microphone or speaker; see the [spoken-image notes](docs/research/2026-11-12-spoken-image.md).

The installed French Vosk vocabulary lacks exact entries for `fixture` and `calculator`, so transcription review remains important for file tasks. A local CPU comparison with quantized Kyutai STT recovered parts of those names but not the exact paths; its streaming and real-room performance remain unverified. See the [ASR notes](docs/research/2026-11-17-vosk-vocabulary-kyutai.md).

An experimental buffered Kyutai CPU sidecar transcribed a synthetic arithmetic question correctly in two end-to-end checks where the Vosk path failed; the repeat took about 3.3 seconds after input ended to produce the transcript. It is not the default recognizer or a full-duplex streaming implementation. See the [experiment](docs/research/2026-11-17-buffered-kyutai-and-mockup.md).

Historical scripts can submit directly to OpenCode, bypassing gateway resource admission; use them only with the intended disposable fixture. Their earlier approval behavior is documented in the [direct-probe notes](docs/research/2026-11-17-direct-probes.md).

New Windows demo starts configure a small shared reservation database so participating gateways account for each other's estimated tasks. Older or independently configured gateways do not participate, so this is not a global limit. Reservations from a crash or an uncertain task deliberately remain until an operator verifies the task has stopped and reconciles the ledger. Existing gateways need restarting to use it.

Inspect retained estimates with `node scripts/inspect-task-reservations.mjs`. The ledger records the local OpenCode session ID when available; a missing or exited gateway PID does not prove that task stopped. After independently verifying the task has stopped in the correct harness, an operator can release a specific estimate with `node scripts/inspect-task-reservations.mjs .cache/assistant/task-reservations.sqlite --release UUID --confirmed-stopped`. This does not stop a task or free memory.

A temporary real-service gateway started with the ledger and updated resource sampler; at that sample the configured agent-task estimate exceeded available RAM headroom. No task was submitted. See [EXP-177](docs/research/2026-11-13-shared-gateway-smoke.md).

The updated Windows sampler can also report system-wide pagefile usage, and resource status warns above 256 MiB total shared GPU use. Pagefile usage cannot be attributed to this application from that number alone. Running samplers and gateways must be restarted to expose the new field. See [EXP-173](docs/research/2026-11-13-windows-memory-counters.md).

A sparse agent-process page inspection could not resolve which allocations reside in VRAM, RAM or storage; valid page flags are not proof of model residency. See [EXP-179](docs/research/2026-11-13-agent-residency-snapshot.md).

An official Q4_K_M version of the current Q8 controller has been downloaded and hash-verified for a future controlled comparison. Its smaller file size is not a measured VRAM saving or evidence of equivalent French tool use. See [EXP-174](docs/research/2026-11-13-controller-q4-candidate.md).

A French text delegation probe now covers opposing operations, negation and ordinary conversation without executing tools. Semantic review remains mandatory; no Q4/Q8 result is claimed yet. See [EXP-175](docs/research/2026-11-13-controller-eval.md).

A guarded baseline runner checks the existing controller, memory samples and configured demo connections before running that probe. It refused the current preflight because demo connections were active; no real comparison was started. See [EXP-190](docs/research/2026-11-14-controller-baseline-guard.md).

Older Windows model-trial scripts now compare total observed shared GPU use against the 256 MiB guard, rather than permitting that amount of additional shared usage above their starting baseline. Sampling cannot guarantee no spill; see [EXP-163](docs/research/2026-11-13-absolute-shared-guard.md).

The cascade can attach a selected image to the next spoken question when the gateway advertises that capability. One synthetic French question about a generated red image passed through the real local services; browser file selection, physical microphone and real-world vision remain unverified. Spoken output removes common markup and replaces code and links with short cues; the complete task result stays in the conversation.

A quantized LFM3-Omni projector was loaded in a guarded native speech experiment. Some generated audio was truncated or failed independent transcription checks; the mode is not a validated replacement for the cascade. See the [candidate record](docs/research/2026-11-17-lfm3-omni-candidate.md).

The browser reports detected playback gaps over 30 ms in the conversation log. This can help distinguish delivery interruptions from pronunciation problems, but does not identify their cause or measure audio quality.

Playback scheduling now keeps consecutive audio chunks adjacent while a queue remains, avoiding a previously possible artificial pause. This correction has a mock-clock regression test; its effect on live speech remains to be heard.

The cascade filters explicit `<think>` and `<analysis>` blocks from model answers before display, history and speech, including an unmatched closing tag and a truncated closing marker. An integration test covers the reported Nantes response through the gateway and TTS request. This is format-specific and cannot reliably detect unmarked reasoning; native speech generated directly by a model is not filtered by this text path. The updated port 18093 gateway includes this filter.

The guarded Windows coding experiment accepts separate agent and gateway ports, so an existing demo need not be stopped to run it. The experiment still requires its configured RAM and GPU headroom and uses a disposable fixture.

A later synthetic spoken coding attempt misrecognized the filename and operation, then the controller delegated the opposite change. Its watchdog stopped the trial below the RAM reserve; the fixture was unchanged. Spoken coding requests are therefore not yet dependable. See [EXP-144](docs/research/2026-11-12-spoken-coding-failure.md).

The updated cascade offers an optional **Review speech before sending** mode: the user can edit the transcript before it reaches the controller. It is off by default and does not make recognition or task execution infallible. A synthetic French review and edited submission passed through the real services on port 18092; physical microphone use remains unverified for this version.

A guarded synthetic ASR probe compares recognition of operation direction, negation and a filename. In one three-phrase run, both the Vosk baseline and a CPU FastConformer candidate missed the filename; this does not establish general accuracy.

A quantized Kyutai French/English STT candidate was initially inventoried without a verified runtime. Subsequent Windows CPU file-mode experiments used the pinned CrispASR runtime and Q4 model, including a synthetic voice loopback; an optional sidecar buffers complete utterances and is not the default or a streaming solution. A persistent HTTP experiment exposed a likely sample-rate mismatch and remains under investigation. See the [initial inventory](docs/research/2026-11-12-kyutai-stt-inventory.md), [buffered tests](docs/research/2026-11-17-buffered-kyutai-and-mockup.md) and [persistent-server experiment](docs/research/2026-11-17-kyutai-persistent.md).

A pinned Windows CPU research runtime, CrispASR, has been tested with an existing 117 MB French FastConformer checkpoint. One small synthetic comparison is recorded; live streaming, broad accuracy and sustained resource use remain unverified.

The ASR coding probe compares both candidates on identical synthetic audio; its file-based and streaming timings are not directly comparable. See [EXP-155](docs/research/2026-11-13-asr-comparison.md).

An existing quantized Voxtral Realtime checkpoint and a pinned Windows CPU/Vulkan transcribe.cpp library are a further streaming-ASR candidate. The library has only been initialized in CPU discovery mode; Voxtral, B60 execution and coexistence with the agent remain untested. See [EXP-156](docs/research/2026-11-13-voxtral-runtime.md).

For this pinned API, the exposed encoder attention KV choices are automatic, FP16 and FP32; its generic context cap is documented as ineffective for Voxtral Realtime. Quantized KV and a bounded context for this candidate are therefore not established. See [EXP-157](docs/research/2026-11-13-voxtral-abi.md).

Inspection of the pinned Voxtral streaming implementation and the local model metadata estimates 1,600 MiB for its FP32 encoder and FP16 decoder KV tensors alone. These are not quantized KV caches, and weights, buffers and other models are additional. No model allocation was measured. See [EXP-158](docs/research/2026-11-13-voxtral-kv.md).

Upstream llama.cpp and ExecuTorch document alternative streaming paths, but their Intel GPU support, cache behavior and memory use for this model need verification. See [EXP-159](docs/research/2026-11-13-voxtral-alternatives.md).

The installed llama.cpp build's source allocates a separate FP16 Voxtral audio encoder state; its generic cache quantization options do not establish quantized encoder state. A compatible separate audio projector and actual device measurements are still needed. See [EXP-160](docs/research/2026-11-13-llama-voxtral-source.md).

The running agent model retained substantial host memory after the stopped coding trial. A non-restarting idle-cache recovery attempt was rejected by the installed server, so a reliable low-memory recovery method remains unverified. See [EXP-150](docs/research/2026-11-12-idle-cache-recovery.md).

The updated gateway offers a button to request cancellation of the latest background task started in that browser session. This is best effort: acceptance does not prove the task has stopped or undo changes.

If submission or later status becomes uncertain, the updated gateway retains the task in that session and avoids resubmitting the same normalized request. Status polling retries temporary failures up to three consecutive times; unresolved state remains process-local.

The gateway no longer reports an older completed assistant message as a task result when a newer message is unfinished. It also waits after tool-call steps and reports output-limit truncation as an error. The updated port 18093 gateway includes this code, which has mock coverage but has not been verified with a new live agent task.

When resource reporting and admission use the same sample, the browser can also show estimated headroom for one task. This projection excludes active task reservations and is not a promise that a task will be accepted.

The updated gateway displays sampled GPU and RAM status in the local client. A low or stale sample is shown explicitly; reporting alone does not block work or establish that model weights remain in VRAM. The older port 18088 gateway does not expose this endpoint.

When a new agent task is dispatched, the gateway includes a bounded selection of recent conversation and task events as untrusted background. In one synthetic test the real local agent returned a random code supplied only in an earlier session message; the voice controller was mocked. An opt-in session-resume experiment can restore recent history after browser reloads, and after gateway restart when using file-backed history. A real cascade controller recalled a synthetic code after reconnecting in one explicit-endpoint test. This is not a complete shared memory or prompt-injection boundary. The updated port 18089 demo uses volatile history; the older gateway does not support resume.

A disposable-workspace probe for delegating a coding fix through the real cascade controller completed in one guarded synthetic text run: one agent task fixed a simple addition function, a separate follow-up received a text response before completion, and audio bytes were produced. An earlier run was stopped below the RAM reserve. Neither run tests a physical microphone, audible speech quality, general coding ability or native speech-to-speech.

A subsequent synthetic French speech version reached task delegation and a separate follow-up response, but the watchdog stopped it below the RAM reserve before the edit completed. See the [experiment record](docs/research/2026-11-10-native-duplex.md#exp-126-synthetic-spoken-coding-request-stopped-at-ram-reserve).

In a synthetic spoken follow-up, the cascade recalled one colour after reconnecting, while separate secret-word trials failed through recognition or model behavior. No physical microphone or audible playback was tested in those runs.

For resumable sessions, the updated browser displays a bounded recent task-event history on reconnect, including recorded offline completions. Mock tests cover session separation and file-backed restart; this does not replay missed spoken notifications.

The updated cascade gateway can speak a short excerpt of a completed agent result. One synthetic text-driven real-agent trial produced notification audio after a successful coding task; the audio was not listened to. A separate synthetic notification test recovered two of three marker words with the local ASR. This path is active on port 18089 but not in the older running demo.

The updated browser also retries ordinary gateway disconnects and preserves unsent text. If the microphone was enabled, it resumes sending when recognition is ready. Reconnect behavior currently has simulated-browser and mock-service evidence only.

In one short synthetic run with the cascade, an agent task and CPU speaker extraction, sampled dedicated GPU use peaked at 14.86 GiB. Sampling cannot prove a 24 GB hard ceiling or rule out RAM or disk spill; see the [measurement limitations](docs/research/2026-11-10-noisy-room.md#exp-094-concurrent-extractor-and-system-memory-sampling).

For disposable local tests, `ASSISTAI_DB_PATH=:memory:` keeps the gateway's SQLite session events in memory for the process lifetime. The default demonstration still uses a local database file.

A native timestamp-aware echo-cancellation client is under research as a comparator. Synthetic overlap tests showed variable preservation of the constructed near-end signal. A standalone low-volume WASAPI probe opened the physical devices, but did not test live barge-in or establish echo attenuation. The current browser filter has not solved speaker feedback.

A separate CPU LocalVQE echo-cancellation candidate suppressed several synthetic echo paths while preserving a second synthetic voice. A 700 ms delay caused false interruption detections; manually aligning the reference helped that one simulated case, while overcorrecting failed. The offline delay estimator also showed sensitivity to simulated clock mismatch and stronger alternate paths. Physical probes have not established a reliable playback delay or demonstrated echo cancellation. Neither component is integrated for live interruption. See the [echo research](docs/research/2026-11-10-noisy-room.md#exp-105-delay-estimator-robustness-on-synthetic-interference).

An experimental Windows native audio client connects the gateway to WASAPI with speaker-safe mode by default and a manual interruption key. In one user-reported test, it understood a spoken French question and the manual interruption key worked. Earlier physical-device smoke tests did not recognize a synthetic question at two thresholds. Its opt-in AEC mode falsely interrupted itself in a synthetic loopback test; automatic voice interruption in a real room is not established.

The native client can request spoken task-completion notifications after the current turn and playback finish. Its notification queue and mock-device flow have been tested; real-device notification timing and intelligibility remain unverified.

An optional CPU speech-activity classifier is available in the native client for research. It reduced early activation from synthetic white noise and tones in one comparison, but did not improve the white-noise transcript or distinguish another synthetic speaker. It has not been validated in the user's noisy room.

CPU target-speaker extraction is an opt-in experiment in the Windows native client, requiring an explicit local enrollment WAV. It is speaker-safe only and is not integrated into the browser client. A synthetic-device test initially clipped a question that began immediately; after a short extractor warm-up, one immediate-onset test transcribed it correctly. It can select the wrong person if enrolled incorrectly. Real-room quality, actual queue behavior and sustained concurrent resource use remain unverified. See the [noisy-room experiments](docs/research/2026-11-10-noisy-room.md).

An explicitly invoked Windows command can record the enrollment WAV locally; see the [prototype instructions](prototype/README.md). The voice file persists until the user deletes it.

The client identifies the active voice mode. In experimental native speech mode it disables text and image inputs; an optional CPU Vosk sidecar can display a separate, imperfect transcript of the same audio. One synthetic real-model test exercised it alongside background delegation.

The voice client also shows the latest gateway agent event independently from assistant speech. The model can claim it delegated a task without issuing a tool call; check the gateway event rather than assuming that spoken statement confirms execution. The indicator shows the latest event, not the status of every parallel task.

Native speech mode has an experimental, off-by-default `ASSISTAI_LFM_NOTIFICATION_TTS=1` option to speak completed-task excerpts through the configured local TTS service. Conversational turns still use the native speech model. The interface identifies the separate service; the tested Pocket service uses CPU and system RAM, so this does not establish an all-models-in-VRAM configuration. One synthetic browser task used the real native model and agent, but human-audible quality and general reliability remain unvalidated. See the [candidate notebook](docs/research/2026-11-17-lfm3-omni-candidate.md).

For native-mode task notifications, the speech model receives a short excerpt of the completed result. One synthetic fixture test produced the correct result in generated text and nonzero audio; audible quality and reliability across tasks remain unverified.

Native speech-session resets can restore a bounded recent context from the gateway's local session events. After two synthetic tests repeated a completed task, an exact-match reuse safeguard passed one real-model regression. Mock-service tests also cover restoring recent completed results, retaining in-flight task tracking and delivering a completion after an opt-in reconnect to the same gateway process. Gateway restarts, offline event replay and other duplicate-action risks remain.

## Getting started with the interface mockup

Requirements: Node.js 22+ and npm. The existing `bun.lock` was created by an incompatible lockfile version on the tested machine; use the npm lockfile for reproducible installation.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Open `http://localhost:3000`. The browser requests microphone access when capture starts. `GEMINI_API_KEY` is optional and only indicates that a key is present; the current prototype does not implement a complete Gemini Live conversation.

On Windows, `npm ci` removes the existing dependency tree and can fail with `EPERM` if an OpenCode harness is using its executable. Stop the associated owned harness after its tasks have finished (for the editable fixture, `powershell -File scripts/stop-windows-harness.ps1 -EditFixture`), then rerun `npm ci`. Use the corresponding stop command for other configured harnesses; inspect any other process holding the executable before stopping it. A failed installation can leave `tsx` missing, so retry installation before `npm run dev`. Do not overwrite an existing `.env` when repeating setup.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Express and Vite in development, default port 3000. |
| `npm run build` | Build the static client in `dist/`. |
| `npm run start` | Start the Node server after building, with `NODE_ENV=production`. |
| `npm run lint` | Type-check without emitting files. |

The demo includes web, mobile, and simulated terminal clients; microphone RMS and local barge-in; in-memory projects and sessions with a displayed 256K context; simulated 3D, code, image, music, and enterprise connectors; an RBAC console; and PWA installation.

Do not expose this prototype or use it to manage real data. It lacks network authentication, persistence, secret encryption, robust session controls, and OAuth. Demo identities, keys, permissions, projects, artifacts, and logs are lost on restart. See [production gaps](docs/ARCHITECTURE.md#production-gaps).

## Repository structure

```text
src/components/    React voice, harness, RBAC, and project interfaces
src/services/      WebSocket, browser audio synthesis, RBAC state
src/hooks/         PWA installation
src/types/         Shared TypeScript contracts
server.ts          Express server, WebSocket, and demo state
vite.config.ts     Vite, Tailwind, and PWA configuration
docs/              Architecture, RBAC, and research notebook
```
