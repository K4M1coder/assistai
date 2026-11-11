# Mochi Voice & Agent Harness

> Status: **experimental local voice prototype and separate interface mockup**. The local prototype supports a French speech cascade and limited agent delegation; native speech-to-speech remains research. See the [research notebook](docs/research/README.md) for evidence and experiment history.

This repository contains two separate interfaces. The React web/PWA interface is a mockup with simulated harness, telemetry, connectors and RBAC. The experimental local voice client is served by `prototype/gateway.mjs` and uses local inference services. See [architecture](docs/ARCHITECTURE.md) and [RBAC](docs/RBAC.md).

The initial interface and project code are in English; a multilingual UI is planned. Spoken language will be configured independently, including French speech recognition and generation. French recognition and generation are available in the experimental cascade; quality and full-duplex behavior remain under evaluation.

## Current local voice prototype

The experimental client is available on this machine at [http://127.0.0.1:18088/](http://127.0.0.1:18088/) while its local services are running. The gateway default is port 18083; the current demonstration instance uses 18088. It currently uses Vosk French recognition, an LFM3 text voice controller served by llama.cpp, and Kyutai Pocket TTS. A separate Gemma model and OpenCode can handle background tasks and image questions. This is a cascade, not native speech-to-speech; the browser shows the configured service and model names.

Speaker-safe mode prevents voice interruption during playback; the Interrupt button remains available. Hold-to-talk and the experimental playback-reference echo filter can be combined with other settings. The filter has not been validated as effective for speakers; false self-interruptions were reported. The noise detection slider controls the microphone threshold.

Research prototypes separately tested MiniCPM-o and LFM3-Audio native speech paths, synthetic French delegation through a read-only fixture, and explicit cancellation. An opt-in LFM realtime gateway path now exists, but the running demonstration still uses the cascade; the new path has synthetic and mock-server integration tests, including a real-model synthetic completion notification. The 24 GB budget, full-duplex interruption, French native speech quality, sustained workloads and no memory spill are not yet proven. See [native duplex experiments](docs/research/2026-11-10-native-duplex.md) and [local prototype details](prototype/README.md).

An optional sampled resource check can reject new background tasks when measured headroom is insufficient; it does not reserve memory or enforce a GPU ceiling. It is disabled in the current demonstration.

The client identifies the active voice mode. In experimental native speech mode it disables text and image inputs; an optional CPU Vosk sidecar can display a separate, imperfect transcript of the same audio. One synthetic real-model test exercised it alongside background delegation.

For native-mode task notifications, the speech model receives a short excerpt of the completed result. One synthetic fixture test produced the correct result in generated text and nonzero audio; audible quality and reliability across tasks remain unverified.

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
