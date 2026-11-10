# Native full-duplex candidates and B60 feasibility

The active prototype remains a Vosk → text LLM → Pocket TTS cascade. It cannot establish native full-duplex behavior, and the user reports that the experimental echo path still self-interrupts over speakers. This document does not change that status.

## MiniCPM-o 4.5 and llama.cpp-omni

[The model card](https://huggingface.co/openbmb/MiniCPM-o-4_5-gguf) describes 9B multimodal full-duplex streaming with concurrent input and output. Its documented spoken-conversation languages are English and Chinese; French is not established. The same card's quantized example reports about 11 GB GPU usage on its benchmark hardware, and the [demo instructions](https://github.com/OpenSQZ/MiniCPM-V-CookBook/blob/main/demo/web_demo/WebRTC_Demo/README.md) describe approximately 10 GB runtime usage for a specific Q4 configuration, with a 12 GB NVIDIA duplex minimum. These numbers are not measurements on Intel Arc and omit our concurrently loaded agent and desktop overhead.

[llama.cpp-omni](https://github.com/tc-mb/llama.cpp-omni) provides source for a C++ duplex implementation: 16 kHz audio encoder, Qwen-derived LLM, audio-token decoder and vocoder. It describes one-second audio input chunks and separately documents a full-duplex demo on CUDA and Metal. Its source contains a GGML Vulkan backend, but this is not evidence that every audio component or duplex mode executes correctly on Intel Vulkan, nor that Windows B60 performance meets real-time constraints. Standard `llama-server` model support or a generic Hugging Face generated launch snippet does not establish support for the full native duplex pipeline.

The GGUF repository's Q4_K_M LLM file is 5,026,714,400 bytes at revision `47eeee5b877167846601d816a192f9a2ee62fc25`; other model components, runtime buffers, context and the separate agent must also be counted. No model weights were downloaded or loaded for this feasibility check. Native tool calling, shared task state, French speech output, B60 performance and combined VRAM remain unverified. A front-end/back-end approach is supported conceptually by [this duplex delegation paper](https://arxiv.org/abs/2609.19334), but its results do not validate this machine.

## EXP-025: Windows Vulkan configure

Cloned `tc-mb/llama.cpp-omni` revision `d30f00feadb7ebce95bacd55b0d104e3ef501481` into ignored `.cache/llama-cpp-omni` (3,444 working-tree files, approximately 158 MiB excluding Git metadata). CMake found Visual Studio 2022 and Windows SDK, then configuration with `-DGGML_VULKAN=ON` failed because Vulkan library, headers and `glslc` were not found. No compilation, model loading, inference, or GPU memory increase was performed. This is an environment dependency failure, not evidence that the runtime cannot support B60.

Next: evaluate a verified, pinned Vulkan SDK/toolchain in an isolated setup; build the native runtime without loading weights; inspect backend allocation and supported audio operations; only then plan a bounded, single-model-load experiment. French remains a separate acceptance gate, and an English/Chinese model is a comparator rather than a replacement for French conversation.

## EXP-026: Windows Vulkan build

Downloaded LunarG Vulkan SDK 1.4.350.0 into the ignored workspace cache. Its SHA-256 `855b27ba05d2d8119c5114c5d4ff870ca38f2c632b11e1bb9923b9b7e6ecfe7b` matched the [published SDK listing](https://vulkan.lunarg.com/sdk/home/) and its Windows Authenticode signature was valid. `scripts/setup-vulkan-sdk.ps1` uses the installer's copy-only mode under `.cache`; it does not intentionally install a system-wide SDK. CMake then found Vulkan and `glslc`.

The first build failed on unguarded POSIX `iovec`/`ssize_t` use in `llama-moe-slot.cpp`; a local Windows compatibility patch fixed those errors. The duplex test target then failed on POSIX signal setup under Windows; the same patch adds a Windows `signal` branch. With `patches/llama-cpp-omni-windows-build.patch` applied to the pinned source revision, the Release `llama-omni-test-duplex` target built and its `--help` command printed usage. OpenSSL was not found, so CMake warned HTTPS support was disabled. The build used two MSBuild jobs but the shader generator independently launched many compiler processes; free RAM observed during build stayed above 11 GiB, not a complete peak trace.

This verifies compilation and process startup only. No model or audio was loaded; Vulkan device selection, GPU allocation, streaming operation, model quality, French, tool calls, and combined-budget operation remain untested. The compatibility patch is a research patch, not an upstream-approved fix; its MoE I/O behavior has not been exercised.

## EXP-027: backend enumeration

`python scripts/probe-omni-devices.py` loads the built GGML backend DLLs without loading model weights. It reports `Vulkan0: Intel(R) Arc(TM) Pro B60 Graphics` and the AMD CPU. The Vulkan loader reports the device's capabilities, including FP16 and cooperative matrices. This is only device enumeration: earlier tests required disabling cooperative matrices for stability, and the enumeration output does not prove any specific kernel or audio component works.

The checked-in `tools/omni` source initializes some audio components through GGML's generic GPU backend and the duplex test defaults to GPU layers and a GPU vocoder. This makes a B60 experiment technically plausible, but it does not prove that every operation is supported, that a runtime allocation remains in dedicated VRAM, or that real-time throughput is sufficient. Published duplex memory estimates leave little margin if both current models stay loaded. A trial must preflight the complete component files and quantizations, remove or stop competing allocations as necessary, measure cold/warm dedicated and shared GPU plus RAM and disk I/O, and stop on budget breach. The documented English/Chinese speech limitation remains a separate gate.

## EXP-028: guarded first model load

Downloaded ten pinned GGUF components with `scripts/setup-minicpm-omni.py`, verifying their upstream SHA-256 hashes. The two existing model servers were stopped for the experiment; a four-second input was prepared from an existing locally synthesized French WAV. The test ran with 4096 context and 99 GPU layers, Vulkan cooperative matrices disabled and host-visible video-memory selection disabled. `scripts/run-omni-trial.ps1` sampled adapter memory and free RAM, with an abort threshold of 22 GiB dedicated, 256 MiB shared growth, or 6 GiB available RAM.

The watchdog terminated the test during loading after a sample showed adapter shared GPU memory of 687,296,512 bytes, up 509,935,616 bytes from the 177,360,896-byte baseline. The same sample showed 10,673,725,440 bytes dedicated and 11,094,392,832 bytes available physical RAM. Only three samples were retained; sampling cannot guarantee a hard allocation ceiling. No speech output was produced, and no conclusion about French or duplex quality follows. The increase might reflect staging or other shared allocation; it is not proof of model weights being evicted to RAM. Both original model services were restarted and the gateway reported them online afterward.

The test program's manual argument parser currently leaves the common defaults for memory mapping, host buffers and F16 K/V cache. Investigate explicitly configurable non-mapped/no-host loading and Q8 K/V under the same guard. Do not claim a 24 GiB hard guarantee from the watchdog: it observes allocations after the fact and cannot catch every peak.

## EXP-029: reduced host allocations and Q8 KV

The experimental Windows build patch adds `--low-host-memory` and `--q8-kv` to the duplex test executable. They set non-mapped loading, no host buffer, no prompt cache, Q8 K/V and Flash Attention in the shared common parameters. This is an experimental patch to the test executable, not upstream behavior. The executable rebuilt successfully; component-specific cache behavior and output quality are not yet verified.

With the two other model servers stopped, the guarded test progressed into audio generation setup: the log reported a Vulkan backend for the flow model and a CPU backend for the vocoder. It was stopped when adapter shared GPU use rose from 175,247,360 to 444,289,024 bytes, 269,041,664 bytes of growth, slightly over the 256 MiB limit. Across 26 retained samples, maximum dedicated GPU use was 15,011,643,392 bytes and minimum available physical RAM was 11,592,617,984 bytes. The process was terminated before a usable audio result was verified. This does not prove the shared memory was model-weight spill or that all allocations fit between samples. Both existing model servers were restored afterward.

Next investigate the additional shared allocation by component and initialization phase; do not silently raise the guard. The model's published French speech support remains unverified.

## EXP-030: process-level accounting

Repeated the same guarded load with adapter and trial-process GPU counters. Thirteen samples over approximately 27 seconds were retained. At the stop sample, adapter shared memory was 461,787,136 bytes versus a 189,992,960-byte pre-load baseline; the native process accounted for 269,565,952 bytes of shared GPU memory and 9,030,533,120 bytes dedicated. This supports attributing most of the observed shared increase to the trial process rather than unrelated desktop activity. It still does not identify the individual buffer, prove weight eviction or measure time between samples. Maximum sampled adapter dedicated was 15,062,409,216 bytes and minimum free RAM 11,560,427,520 bytes.

The source contains a CPU-side staging vector in the audio generation loader, but this observation alone cannot establish that the reported process shared allocation is that vector. The extra per-process counter query lengthened sampling intervals, further weakening any claim of a hard ceiling. The watchdog stopped the trial and the previous model services were restored. The 256 MiB shared-growth threshold was not raised.

## EXP-031 and EXP-032: staging instrumentation and bounded uploads

With Vulkan allocation logging enabled, EXP-031 identified a 188.75 MiB host-visible synchronous staging allocation, alongside other host allocations. This identifies a transfer buffer, not proof of model-weight eviction. An experimental, opt-in patch splits the ordinary synchronous upload path into 16 MiB pieces; it does not cover every upload path.

In EXP-032, with the existing model servers stopped and the same watchdog thresholds, the patched test exited successfully after processing all four one-second synthetic French input chunks. All four output decisions were listen; no output audio was generated. Three initial listen decisions were forced by the test configuration, so this is not a meaningful French conversation test. A separate 188.75 MiB staging request still occurred, demonstrating the patch does not cap all staging. Sampled adapter dedicated usage peaked at 15,016,591,360 bytes; shared usage rose from a baseline of 172,838,912 to 431,132,672 bytes (258,293,760 bytes), below the 256 MiB growth guard. The minimum sampled available RAM was 8,553,078,784 bytes. These sampled numbers cannot exclude transient peaks, paging, or model residency outside VRAM. The existing servers were restored.

The test ran without the agent model, so it does not establish that the combined system fits 24 GiB. It does not verify speech generation, French quality, interruption, tool calls, or a stable real-time session. Next isolate the remaining large transfer path and test a longer utterance followed by silence, using a known-supported English control as well as French, before drawing conclusions about conversation quality.

## EXP-033 and EXP-034: longer English and French controls

A local Windows speech synthesizer generated the same moon-fact request in English and French. Each 16 kHz utterance occupied six one-second chunks, followed by five one-second silence chunks; the runtime received one chunk per second. Both trials used the prior 16 MiB partial upload patch and memory guard, with the other model servers stopped.

In English the native duplex test reported 11/11 processed chunks and generated the text “The moon is slowly moving away from Earth, growing about an inch every year.” It produced three non-silent 24 kHz WAV chunks totaling 2.20 seconds. In French it reported 11/11 chunks and generated “Il y a un anecdote sur la lune.”, which is grammatical and semantic evidence of a weak/incomplete response, followed by three non-silent WAV chunks totaling 2.20 seconds. Non-silent audio is not proof of intelligibility, correct pronunciation, or successful playback. Neither test evaluates interruption or sustained conversation.

English sampled adapter dedicated maximum was 15,027,707,904 bytes and shared rose from 190,402,560 to 437,997,568 bytes. French sampled dedicated maximum was 15,010,836,480 bytes and shared rose from 177,934,336 to 435,638,272 bytes. Both remained under the sampled watchdog thresholds; intermittent polling cannot establish hard limits. The native process completed its logged test and cleanup, but Windows PowerShell returned a null process exit code in both runs, so the wrapper returned failure and actual exit status is unknown. The wrapper now retains the process handle and uses distinct output directories; a separate short process confirmed handle-based exit-code retrieval, but another native trial is needed to verify this fix. The existing services were restored.

These results are a promising native pipeline control, not proof that this model supports useful French conversation, that it shares memory with the agent, or that both models fit simultaneously. The agent model was absent, and the CPU vocoder and other host activity mean this is not a VRAM-only system.
