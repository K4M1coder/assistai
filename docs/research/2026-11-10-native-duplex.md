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
