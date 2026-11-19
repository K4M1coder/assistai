# Process-level GPU memory observations on Windows

## Hypothesis and sources

Per-process GPU counters may help identify which inference servers contribute to shared GPU memory, supplementing the existing whole-adapter watchdog. They cannot identify individual model weights or prove physical residency. Microsoft's [DXGI memory information](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/ns-dxgi1_4-dxgi_query_video_memory_info) describes an application's current usage and OS budget, not the contents of its allocations. [WDDM residency documentation](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/driver-residency-in-wddm-2-0) describes process residency budgets and their variability. A single sample is not a bound on past or future allocations; even sustained sampling can miss transients. PID reuse, subprocesses, shared allocations and OS accounting further limit attribution.

## Local observation

On 2026-11-19, `Get-Counter -ListSet 'GPU Process Memory'` listed per-process dedicated and shared usage counters on this Windows machine. `& .\scripts\snapshot-gpu-process-memory.ps1 -ProcessId @(60860,34416)` sampled the current adapter instance. The model server on port 18080, PID 60860, reported 7,959,998,464 dedicated and 30,425,088 shared bytes. The text controller on port 18084, PID 34416, reported 1,998,295,040 dedicated and 14,204,928 shared bytes. Both were existing llama.cpp processes; commands and model configuration were inspected locally. The script also records process start times to aid identification. This is one idle snapshot, not a concurrent workload measurement or proof that model weights or context spilled to RAM. Shared usage can include buffers and driver allocations, so its presence alone does not classify those bytes.

The script requires explicit process IDs and adapter instance, rejects invalid IDs and missing or ambiguous counter instances, and is read-only. Local checks confirmed that a negative PID and an absent GPU counter are rejected. It does not track PID identity continuously, collect every child process, enforce a memory limit, or prove that Windows did not page allocations. The specific PIDs and adapter identifier are machine-specific and can change after restart. Do not silently treat a missing counter as zero.

## Next experiment

Capture these counters alongside whole-adapter telemetry during an owned, guarded voice-and-agent trial, recording process identities and task timing. Compare deltas rather than assuming all shared usage is model memory. Stronger evidence of tensor allocation and residency requires backend-specific tracing and still may not establish a hard no-spill guarantee under all conditions.
