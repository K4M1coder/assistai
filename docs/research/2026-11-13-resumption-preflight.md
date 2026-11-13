# EXP-180: Resumption preflight and current blockers

## Hypothesis and acceptance criteria

The existing cascade may be demonstrable without changing or reloading its models.
Health endpoints alone cannot establish that. A demonstration must include an
actual French human voice through a physical microphone, a relevant response
audible on the selected output, manual interruption, and an orderly shutdown.
It must also expose unavailable services and rejected tasks without claiming
success. A repeatable demonstration must identify the installed dependencies,
models and startup procedure. Full-duplex interruption, robust recognition,
successful delegation and the no-spill target require their own evidence.

## Protocol and observed state

On 2026-11-13 at approximately 23:52 local time, at Git commit `e08d02e`,
the working tree already contained uncommitted changes to
`prototype/agent-context.mjs`, its test, and `prototype/gateway.mjs`. They
were not changed or committed by this experiment. Windows 11 build 26200,
Node.js v24.14.1, Python 3.11.14 and the Intel Arc Pro B60 driver
32.0.101.8805 were observed. The installed model services and older gateway
processes were left running.

Read-only loopback GETs to `/health` and `http://127.0.0.1:18093/services`
reported Vosk `vosk-model-small-fr-0.22`, an LFM3-1.7B Q8 controller,
Pocket TTS and a Gemma 4 agent model available. The gateway reports volatile
history, which does not guarantee that other components or the OS retain no
data. Audio enumeration with
`.\.venv-voice\Scripts\python.exe -c "import sounddevice as sd; print(sd.default.device); print(sd.query_devices())"`
reported a LifeCam microphone and a display audio output. Device enumeration
does not prove an audible physical speaker or working capture.

The following read-only measurement used the adapter identifier already
configured in `scripts/start-windows-demo.ps1`:

```powershell
$adapter='luid_0x00000000_0x00013269_phys_0'
Get-Counter -Counter "\GPU Adapter Memory($adapter)\Dedicated Usage","\GPU Adapter Memory($adapter)\Shared Usage"
Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory
```

One sample showed 16,381,677,568 bytes dedicated GPU usage, 294,830,080 bytes
shared GPU usage and approximately 7.11 GiB available RAM. Total shared GPU
usage exceeded the existing 256 MiB guard, and available RAM was below the
8 GiB preflight requirement in `scripts/start-windows-demo.ps1`. The gateway
on port 18093 also reported its single-task estimate as insufficient. These
are system-wide samples, not proof of model-specific spill or a hard limit.
Existing gateways predate some current changes and must not be interpreted as
running the uncommitted source. No inference, task, microphone capture or
speaker playback was initiated in this experiment.

After the user authorized stopping orphaned processes, the obsolete prototype
gateways on ports 18088, 18091 and 18092 were stopped, together with the
verified samplers associated with ports 18091 and 18092. The current gateway
on port 18093 and its model services were left running. A subsequent sample
showed 16,351,076,352 bytes dedicated GPU usage, 228,376,576 bytes shared
GPU usage and 7,596,105,728 bytes available RAM. Shared usage was below the
256 MiB threshold in that sample, but RAM still failed the 8 GiB preflight.
These readings can fluctuate; neither establishes sustained headroom.

## Failure-path tests

```powershell
node --test prototype\resource-budget.test.mjs prototype\resource-status.test.mjs prototype\service-status.test.mjs prototype\task-admission.test.mjs prototype\shared-task-reservations.test.mjs prototype\agent-context.test.mjs
node --test prototype\client-mode.test.mjs prototype\task-admission-gateway.integration.test.mjs prototype\service-status.test.mjs
```

The commands passed 22 and 6 tests respectively. They use controlled
inputs or mock services, including a simulated dropped browser connection,
unavailable synthesis service and uncertain agent task. They are not a
physical audio test or a live provider failure test. The tests include the
pre-existing uncommitted context test; a pass does not validate its live
integration.

## Source cross-check and decision

The upstream [Vosk repository](https://github.com/alphacep/vosk-api)
describes offline French streaming recognition, and
[Pocket TTS](https://github.com/kyutai-labs/pocket-tts) describes CPU
execution and French support. These are authors' claims, not results measured
here. The [LFM3 GGUF model card](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF)
documents Windows support and its runtime requirements; the current model
health response does not itself verify answer quality. The existing
`llama.cpp` Vulkan runtime was not replaced. Do not load a second model or
override the guard to force a trial; stop no process belonging to another
session without an explicit decision.

## Next action

Restore sufficient RAM headroom, then rerun the documented preflight
and start an isolated gateway using the current source. Have a consenting
human speak a short French question, confirm that the transcript and audible
answer are correct, and test manual interruption. Record aggregate timing,
device selection, failures and resource samples without retaining personal
audio or transcripts. If no audible output or physical speaker is available,
resolve the device setup before claiming a successful demonstration. Test
live provider failures only with isolated, owned services; do not interrupt
existing users' services.
