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

This observation confirms only the displayed service status and disabled/unavailable UI state for the existing gateway. It does not validate the new resource endpoint, session resume in a real browser, audio quality, GPU residency, or a 24 GB hard limit.
