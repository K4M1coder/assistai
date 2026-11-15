# Resumption and demonstration acceptance — 2026-11-15

## Acceptance criteria

A reproducible demonstration must start local services from documented commands, report their actual readiness and shut down only its own processes. On this Windows machine it must capture a French question from a real microphone, return a relevant intelligible spoken answer, handle a manual interruption, run an approved background agent task and report its outcome while conversation remains usable. Voice interruption, target-speaker handling in room noise, vision input, shared memory across reconnects and native full-duplex speech must each be demonstrated separately; a speaker-safe cascade is not evidence of them. Record model versions, engine configuration, task results, failure paths and resource observations. The requested 24 GB dedicated-VRAM budget without RAM/SSD overflow requires evidence over the complete concurrent workload, including model loading, caches and transients; periodic counters and advisory estimates do not enforce or prove it. No final product or paper is claimed until the relevant criteria are verified.

## Initial state

At resumption, the port 18096 gateway returned `running` and reported volatile history, but `/services` showed the voice controller, agent model, French ASR and French TTS all unavailable. Ports 18094, 18095 and 18096 had gateway listeners; no established connections were observed in the port check. They were not stopped. A whole-system snapshot reported 1,976,479,744 bytes dedicated GPU, 243,462,144 bytes shared GPU, 15,300,272,128 bytes available RAM and 186,646,528 bytes system pagefile use. These are observations, not per-process allocation or no-spill evidence.

## Restoring cached speech services

Hypothesis: the pre-existing cached Vosk and Pocket TTS French models can be restored without downloading weights or loading a GPU model. `scripts/start-windows-speech.ps1` starts the local Python 3.11.14 services with `HF_HUB_OFFLINE=1` and their existing caches; the GPU model servers and harness remain stopped. The launcher refuses an existing ownership record or occupied ports. Windows executable wrappers spawned additional Python processes, so the launcher records verified descendant PIDs, start times and command lines; the stop script checks the record before stopping them. It ignores Windows console-host children, which are managed by Windows.

The first attempted stop exposed a nested-array serialization bug in the ownership record; no services were stopped by that failed check. The record was flattened, the launcher fixed, and a complete stop with no remaining listeners followed by restart then succeeded. A duplicate start was refused. Vosk `/health` returned `ready`, French, 16 kHz and `vosk-model-small-fr-0.22`; Pocket TTS `/health` returned HTTP 200. These checks and the process lifecycle test do not prove a physical audio conversation. The launcher requires existing local environments and caches; it does not install or verify their provenance and does not enforce network isolation.

## Real synthetic loopback

Command: `scripts/run-notification-transcription.ps1 -Marker rouge -Markup`. This used the restored Pocket TTS and Vosk processes and a temporary gateway with synthetic session data. Vosk transcribed the expected `rouge` marker and the code-display cue from 324,480 bytes of 24 kHz audio. Six global resource samples showed maximum dedicated GPU 1,285,996,544 bytes, maximum shared GPU 196,530,176 bytes and minimum available RAM 18,756,612,096 bytes. The preflight dedicated value was 1,313,177,600 bytes. The output was not saved or listened to; no physical device or language model was used. ASR agreement does not establish human intelligibility, and sampled counters can miss peaks or spill. Logs are under `.cache/notification-transcription-20261115-004942-788.*`.

## Next action

Restore the controller, vision/coding model and explicitly scoped harness with a reproducible, resource-monitored startup and independently verify their endpoints and real inference before asking for a physical-device demonstration. Do not load another GPU model if the measured preflight lacks safe headroom, and do not stop unrelated processes. The current gateway may run an earlier source version and must not be assumed to include later client or server changes.
