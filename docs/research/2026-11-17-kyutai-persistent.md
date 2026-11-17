# Persistent Kyutai CPU experiment — 2026-11-17

## Question and protocol

Can retaining the quantized Kyutai STT model in memory reduce the buffered sidecar's latency without harming French recognition or exceeding the observed resource guard? The [pinned CrispASR server documentation](https://github.com/CrispStrobe/CrispASR/blob/1694d8ef516799b290c6da5fe80803b4af2771b0/docs/server.md) describes a persistent model and an HTTP transcription endpoint. This is an author claim, not evidence that this specific backend and model perform correctly. The experiment uses the previously hash-verified Q4 model, CrispASR v0.8.53 Windows CPU binary, Pocket TTS synthetic French audio and one second of trailing silence. No physical devices are opened.

Run `./scripts/run-asr-coding-probe.ps1 -PersistentTrial -ProcessMetrics` on the configured Windows machine. The probe sends the same generated waveform to the existing file-mode implementation and twice to a temporary localhost server, then stops its own process. The latest version requests seed 42 and disables fallback in the CLI; HTTP requests additionally specify seed 42 and temperature zero. These controls do not establish equivalent decoding across the two code paths. The server is started without warmup. The timing of file mode includes process and model load; server request timings exclude startup. Each separate trial generates fresh synthetic audio, so compare text within a trial, not as a paired comparison across trials.

The wrapper requires at least 8 GiB available RAM before starting and samples system memory and GPU usage while running; it requests termination if available RAM drops below 6 GiB, dedicated GPU exceeds 22 GiB, or shared GPU exceeds 256 MiB. Sampling can miss transients and cannot establish an absence of paging or GPU spill. Optional process metrics sample descendant working set and private bytes, which are neither total system cost nor proof of model residency. Process enumeration itself can affect timings. The probe writes temporary audio for file mode and the server may create its own temporary files; abnormal termination may leave artifacts. Local network isolation was not independently verified.

## Results

Three trials completed on the running demo machine. Before the first successful trial an earlier attempt refused its preflight due to available RAM. Timings are milliseconds and represent individual observations, not a performance distribution.

| Trial | File mode text / time | Persistent text / request times | Peak dedicated, peak shared, minimum available RAM (bytes) |
| --- | --- | --- | --- |
| `.cache/asr-coding-20261117-224029-014.*`, initial flags | `combien font deux puis trois réponds en un mot` / 11,812 | `combien font deux puis trois réponds en amont` / 2,563, 2,187 | 12,406,222,848; 231,129,088; 9,371,959,296 |
| `.cache/asr-coding-20261117-224147-938.*`, initial flags, process metrics | `combien font deux plus trois réponds en un mot` / 8,750 | `combien font depuis toi réponds en amont` / 2,422, 2,500 | 12,393,349,120; 244,563,968; 9,144,422,400 |
| `.cache/asr-coding-20261117-224443-089.*`, seed and fallback controls, process metrics | `combien font deux plus trois réponds en un mot` / 5,078 | `0xe50x9b0xbd 0xe50xae0xb6 0xe50x880x86 0xe70x9a0x84 0xe60xaf0x94 0xe80xbe0x83 0xe50x9c0xa8 0xe5` / 1,969, 1,797 | 12,345,909,248; 255,574,016; 10,226,921,472 |

Persistent health-check startup took 531, 1,422 and 516 ms respectively; health is not a guarantee of warmed inference. Each pair of persistent outputs matched within its trial. The final trial's observed peak candidate working set was 803,786,752 bytes and private bytes 1,288,785,920; the previous instrumented trial measured 807,923,712 and 1,291,767,808 bytes. These are sampled process snapshots and should not be added together. The last shared-GPU sample was close to the configured threshold, and the guard is not a hard reservation.

## Decision and next experiment

The persistent requests were faster in these observations, but two trials corrupted the arithmetic and the controlled-seed trial produced unusable byte-like output. This is insufficient for a user-facing replacement; the gateway retains its current recognizer. Causes such as different defaults, request handling, decoder state or a backend bug remain hypotheses. Inspect the pinned implementation's request and file decoding paths, reproduce with a fixed retained non-personal fixture and matched parameters, then test diverse French voices, noise and interruption before considering integration. These tests do not validate physical audio, real-time streaming, full duplex or the full 24 GiB no-spill requirement.
