# Mochi Voice & Agent Harness

> Status: **experimental local voice prototype and separate interface mockup**. The local prototype supports a French speech cascade and limited agent delegation; native speech-to-speech remains research. See the [research notebook](docs/research/README.md) for evidence and experiment history.

This repository contains two separate interfaces. The React web/PWA interface is a mockup with simulated harness, telemetry, connectors and RBAC. The experimental local voice client is served by `prototype/gateway.mjs` and uses local inference services. See [architecture](docs/ARCHITECTURE.md) and [RBAC](docs/RBAC.md).

The initial interface and project code are in English; a multilingual UI is planned. Spoken language will be configured independently, including French speech recognition and generation. French recognition and generation are available in the experimental cascade; quality and full-duplex behavior remain under evaluation.

## Current local voice prototype

The experimental client is available on this machine at [http://127.0.0.1:18088/](http://127.0.0.1:18088/) while its local services are running. The gateway default is port 18083; the current demonstration instance uses 18088. It currently uses Vosk French recognition, an LFM3 text voice controller served by llama.cpp, and Kyutai Pocket TTS. A separate Gemma model and OpenCode can handle background tasks and image questions. This is a cascade, not native speech-to-speech; the browser shows the configured service and model names.

Speaker-safe mode prevents voice interruption during playback; the Interrupt button remains available. Hold-to-talk and the experimental playback-reference echo filter can be combined with other settings. The filter has not been validated as effective for speakers; false self-interruptions were reported. The noise detection slider controls the microphone threshold.

Research prototypes separately tested MiniCPM-o and LFM3-Audio native speech paths, synthetic French delegation through a read-only fixture, and explicit cancellation. An opt-in LFM realtime gateway path now exists, but the running demonstration still uses the cascade; the new path has synthetic and mock-server integration tests, including a real-model synthetic completion notification. The 24 GB budget, full-duplex interruption, French native speech quality, sustained workloads and no memory spill are not yet proven. See [native duplex experiments](docs/research/2026-11-10-native-duplex.md) and [local prototype details](prototype/README.md).

The Windows audio client has also been exercised against the native gateway using simulated devices and a mock inference server, including one manual-interruption and late-audio test. The client prints whether the gateway reports cascade or native speech mode. In native mode, the web service list identifies a configured parallel transcription engine separately from the speech-to-speech model; a physical-device test against the real native speech model remains outstanding.

An optional sampled resource check can reject new background tasks when measured headroom is insufficient. It accounts conservatively for estimated concurrent tasks within one gateway process, but does not reserve memory or enforce a GPU ceiling. It is disabled in the current demonstration.

When a new agent task is dispatched, the gateway includes a bounded selection of recent conversation and task events from that connection as untrusted background. This is preliminary shared context, not persistent memory across reconnects or a prompt-injection boundary. Existing gateway processes need restarting to pick up this change.

In one short synthetic run with the cascade, an agent task and CPU speaker extraction, sampled dedicated GPU use peaked at 14.86 GiB. Sampling cannot prove a 24 GB hard ceiling or rule out RAM or disk spill; see the [measurement limitations](docs/research/2026-11-10-noisy-room.md#exp-094-concurrent-extractor-and-system-memory-sampling).

For disposable local tests, `ASSISTAI_DB_PATH=:memory:` keeps the gateway's SQLite session events in memory for the process lifetime. The default demonstration still uses a local database file.

A native timestamp-aware echo-cancellation client is under research as a comparator. Synthetic overlap tests showed variable preservation of the constructed near-end signal. A standalone low-volume WASAPI probe opened the physical devices, but did not test live barge-in or establish echo attenuation. The current browser filter has not solved speaker feedback.

A separate CPU LocalVQE echo-cancellation candidate suppressed several synthetic echo paths while preserving a second synthetic voice. A 700 ms delay caused false interruption detections; manually aligning the reference helped that one simulated case, while overcorrecting failed. A first physical-device probe could not establish the playback delay and did not demonstrate echo cancellation. Neither component is integrated for live interruption. See the [echo research](docs/research/2026-11-10-noisy-room.md#exp-103-physical-device-localvqe-feasibility-probe).

An experimental Windows native audio client connects the gateway to WASAPI with speaker-safe mode by default and a manual interruption key. In one user-reported test, it understood a spoken French question and the manual interruption key worked. Earlier physical-device smoke tests did not recognize a synthetic question at two thresholds. Its opt-in AEC mode falsely interrupted itself in a synthetic loopback test; automatic voice interruption in a real room is not established.

The native client can request spoken task-completion notifications after the current turn and playback finish. Its notification queue and mock-device flow have been tested; real-device notification timing and intelligibility remain unverified.

An optional CPU speech-activity classifier is available in the native client for research. It reduced early activation from synthetic white noise and tones in one comparison, but did not improve the white-noise transcript or distinguish another synthetic speaker. It has not been validated in the user's noisy room.

CPU target-speaker extraction is an opt-in experiment in the Windows native client, requiring an explicit local enrollment WAV. It is speaker-safe only and is not integrated into the browser client. A synthetic-device test initially clipped a question that began immediately; after a short extractor warm-up, one immediate-onset test transcribed it correctly. It can select the wrong person if enrolled incorrectly. Real-room quality, actual queue behavior and sustained concurrent resource use remain unverified. See the [noisy-room experiments](docs/research/2026-11-10-noisy-room.md).

An explicitly invoked Windows command can record the enrollment WAV locally; see the [prototype instructions](prototype/README.md). The voice file persists until the user deletes it.

The client identifies the active voice mode. In experimental native speech mode it disables text and image inputs; an optional CPU Vosk sidecar can display a separate, imperfect transcript of the same audio. One synthetic real-model test exercised it alongside background delegation.

For native-mode task notifications, the speech model receives a short excerpt of the completed result. One synthetic fixture test produced the correct result in generated text and nonzero audio; audible quality and reliability across tasks remain unverified.

Native speech-session resets can restore a bounded recent context from the gateway's local session events. After two synthetic tests repeated a completed task, a session-local exact-match reuse safeguard passed one real-model regression. This does not provide persistent memory across client reconnections or prevent all duplicate actions.

## Getting started with the interface mockup

Requirements: Node.js 22+ and npm. The existing `bun.lock` was created by an incompatible lockfile version on the tested machine; use the npm lockfile for reproducible installation.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Open `http://localhost:3000`. The browser requests microphone access when capture starts. `GEMINI_API_KEY` is optional and only indicates that a key is present; the current prototype does not implement a complete Gemini Live conversation.

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
