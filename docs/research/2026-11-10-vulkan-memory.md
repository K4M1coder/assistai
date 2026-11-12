# Windows Vulkan model memory comparison

This is an exploratory comparison on the user's Intel Arc Pro B60, Windows, with the same Gemma 12B QAT Q4_0 GGUF, BF16 projector, 8192-token context, Q8 K/V cache, Flash Attention, batch 512 and microbatch 256. The LFM3 voice model remained loaded. These are snapshots, not controlled peak measurements. Other applications were running throughout.

| Load settings | Gemma process working set | Gemma process GPU shared | Adapter GPU dedicated | Available physical RAM |
| --- | ---: | ---: | ---: | ---: |
| Previous default load (EXP-020 and process snapshot) | ~9.5 GiB | 29 MiB | 14.8 GiB | ~4.7 GiB |
| `--load-mode none` (EXP-021) | 1.03 GiB | 811 MiB | 14.8 GiB | 12.9 GiB |
| `--load-mode none --no-host --cache-ram 0` (EXP-022) | 1.01 GiB | 24 MiB | 14.8 GiB | 13.0 GiB |

The last configuration produced valid structured calls in one non-streaming and one streaming tool probe. A second post-inference GPU snapshot retained 24 MiB of process shared allocation. The measured adapter shared total was approximately unchanged versus the previous baseline. The working set and available RAM include OS memory-management behavior and other processes; the results cannot establish exact ownership, sustained peaks, all workloads, or that no paging/eviction ever occurs. Private committed memory remained about 8.8 GiB in the no-mapping configurations; commit is not the same as resident RAM or SSD writes. `--no-host` and `--cache-ram 0` were changed together, so their individual contributions were not isolated. Disabling prompt cache may affect response latency and should be benchmarked with realistic prompts.

[An upstream Windows report](https://github.com/ggml-org/llama.cpp/issues/14187) describes host memory remaining resident with memory mapping; it is a different hardware/build report, not proof of the cause here. The installed server's own help documents `--no-host` and `--cache-ram`. More workload samples, cold-start peaks, GPU shared baselines, measured disk I/O, agent coding and image tests are required before treating the budget as enforced.

The current running model uses the last settings, with `GGML_VK_DISABLE_COOPMAT=1`; no additional model was loaded. This is a temporary experiment, not a cross-platform default.
# EXP-081: concurrent task admission accounting

Hypothesis: a single gateway can conservatively avoid over-admitting concurrent tasks when telemetry and configured per-task estimates are available. The optional admission check now serializes its decisions and adds estimates for tasks already accepted by that process. It releases an estimate after a confirmed terminal result, but retains it on ambiguous submission, status failure or timeout. This can double-count allocations already present in the sample and block legitimate work; gateway restart loses the estimates, and separate processes are not coordinated.

A unit test issued simultaneous admission calls against a synthetic 20 GiB dedicated-memory sample with 1.5 GiB per-task VRAM estimates; one was admitted and one rejected under the configured 22 GiB post-reserve threshold. After release another was admitted, and duplicate release was harmless. A separate gateway integration test used simulated realtime and OpenCode providers: a first client started a task, a second was rejected, the first task's status endpoint then failed, and a third was also rejected. Only one simulated agent session was created. These tests do not measure GPU allocations, guarantee the estimates, enforce model loading limits or prevent OS paging. The check remains opt-in and disabled in the running demo.

## EXP-111: resource status visibility under low RAM

On 2026-11-12, a Windows snapshot showed approximately 4.05 GiB available physical RAM, below the existing 6 GiB reserve. Windows also reported 1,859 MiB of page-file current usage, but that system-wide number does not identify its contents, prove active paging, or show that GPU model weights spilled. The running demo had an established connection; it was not stopped and no additional agent or model server was started.

The updated gateway can optionally read a sampler file using `ASSISTAI_RESOURCE_STATUS_PATH` and report fresh whole-adapter dedicated/shared usage, available RAM, low-reserve conditions, stale/unavailable status and whether separate task admission is enabled. The browser refreshes this report; no hard limit is claimed. Unit tests cover thresholds, missing, malformed and stale samples, and a mock gateway test reports a synthetic 4 GiB low-RAM sample with admission disabled. This is reporting only, not resource reservation, automatic admission or a VRAM residency guarantee. The currently running demo was not restarted, and a live browser has not been tested with the new endpoint.

## EXP-112: inspect the running demo in a desktop browser

The browser-control host was unavailable, so the existing Comet desktop application was controlled using the computer-use workflow. A new local test tab opened `http://127.0.0.1:18088/` without opening the microphone or submitting a user turn. The page identified cascade mode, LFM3-1.7B Q8 and Gemma 4 12B Q4 via llama.cpp, Vosk French ASR and the Pocket TTS API. It showed session resume unavailable and resource status unavailable; the active gateway process had not been restarted and did not expose the new endpoints. The gateway serves current client files separately from its older running server code. The test tab was closed afterward; the pre-existing demo connection was not intentionally interrupted.

## EXP-124: regression suite and live demo status

The current local workspace passed 60 Node tests sequentially and 41 Python unit tests. The Python microphone-enrollment tests used fake devices, despite their simulated console messages. The tests include mock providers, simulated browser state and audio processing; they do not establish physical audio quality, true native full-duplex operation or a hard VRAM ceiling.

The browser-control host was unavailable again, so the Windows computer-use workflow opened a temporary Comet tab to the existing `http://127.0.0.1:18088/` demo. It displayed cascade mode, the two llama.cpp model names, Vosk and Kyutai Pocket TTS, and session resume unavailable. The gateway is still the older running process and does not expose the latest resume and resource functionality. The temporary tab was closed; no microphone or model turn was started. This inspection confirms visible status only, not audio or reconnect behavior.

## EXP-127: inspect spoken trial memory growth and admission estimates

Hypothesis: per-process samples from EXP-126 can identify which observed memory changes merit investigation and inform a safer admission estimate. At the first sample, the Gemma llama-server process had approximately 1.97 GiB working set and 10.87 GiB private bytes. Around sample 15 these fell to 0.14 and 9.04 GiB, then rose to approximately 3.98 and 12.87 GiB at the final sample. The separate trial OpenCode process reached about 422 MiB working set and 721 MiB private bytes. The timing correlates with the concurrent test but does not identify the allocated objects or prove the model was moved from GPU memory to RAM. Process counters and system available RAM overlap and must not be summed as independent consumption.

A later idle snapshot showed the Gemma process at 8,128,176,128 bytes dedicated and 30,425,088 bytes shared WDDM GPU allocation; the voice model process showed 1,999,863,808 bytes dedicated and 14,372,864 bytes shared. It is not synchronized with the peak and does not establish weight residency or no disk paging. The Gemma command line already includes `--load-mode none --no-host --cache-ram 0`; the installed server help confirms these options but does not identify the observed growth. An [AMD Vulkan issue](https://github.com/ggml-org/llama.cpp/issues/30888) reports a different shared-memory failure on hardware without ReBAR; it is not evidence of the cause on this Intel system.

The trial's previous 128 MiB advisory RAM estimate was not credible against the observed global drop. The trial now uses provisional per-task estimates of 2 GiB RAM for text or 3 GiB for synthetic speech, plus 512 MiB dedicated GPU; these can double-count already resident allocations and do not reserve memory. A unit test shows the spoken estimate rejects the EXP-126 preflight snapshot while preserving the 6 GiB reserve. Seven focused resource tests passed, and PowerShell syntax validation passed. No model or trial was started; causality, actual peak demand and a reliable no-spill mechanism remain unresolved.

This observation confirms only the displayed service status and disabled/unavailable UI state for the existing gateway. It does not validate the new resource endpoint, session resume in a real browser, audio quality, GPU residency, or a 24 GB hard limit.
