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
