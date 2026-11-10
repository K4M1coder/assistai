# Native full-duplex candidates and B60 feasibility

The active prototype remains a Vosk → text LLM → Pocket TTS cascade. It cannot establish native full-duplex behavior, and the user reports that the experimental echo path still self-interrupts over speakers. This document does not change that status.

## MiniCPM-o 4.5 and llama.cpp-omni

[The model card](https://huggingface.co/openbmb/MiniCPM-o-4_5-gguf) describes 9B multimodal full-duplex streaming with concurrent input and output. Its documented spoken-conversation languages are English and Chinese; French is not established. The same card's quantized example reports about 11 GB GPU usage on its benchmark hardware, and the [demo instructions](https://github.com/OpenSQZ/MiniCPM-V-CookBook/blob/main/demo/web_demo/WebRTC_Demo/README.md) describe approximately 10 GB runtime usage for a specific Q4 configuration, with a 12 GB NVIDIA duplex minimum. These numbers are not measurements on Intel Arc and omit our concurrently loaded agent and desktop overhead.

[llama.cpp-omni](https://github.com/tc-mb/llama.cpp-omni) provides source for a C++ duplex implementation: 16 kHz audio encoder, Qwen-derived LLM, audio-token decoder and vocoder. It describes one-second audio input chunks and separately documents a full-duplex demo on CUDA and Metal. Its source contains a GGML Vulkan backend, but this is not evidence that every audio component or duplex mode executes correctly on Intel Vulkan, nor that Windows B60 performance meets real-time constraints. Standard `llama-server` model support or a generic Hugging Face generated launch snippet does not establish support for the full native duplex pipeline.

The GGUF repository's Q4_K_M LLM file is 5,026,714,400 bytes at revision `47eeee5b877167846601d816a192f9a2ee62fc25`; other model components, runtime buffers, context and the separate agent must also be counted. No model weights were downloaded or loaded for this feasibility check. Native tool calling, shared task state, French speech output, B60 performance and combined VRAM remain unverified. A front-end/back-end approach is supported conceptually by [this duplex delegation paper](https://arxiv.org/abs/2609.19334), but its results do not validate this machine.

## EXP-025: Windows Vulkan configure

Cloned `tc-mb/llama.cpp-omni` revision `d30f00feadb7ebce95bacd55b0d104e3ef501481` into ignored `.cache/llama-cpp-omni` (3,444 working-tree files, approximately 158 MiB excluding Git metadata). CMake found Visual Studio 2022 and Windows SDK, then configuration with `-DGGML_VULKAN=ON` failed because Vulkan library, headers and `glslc` were not found. No compilation, model loading, inference, or GPU memory increase was performed. This is an environment dependency failure, not evidence that the runtime cannot support B60.

Next: evaluate a verified, pinned Vulkan SDK/toolchain in an isolated setup; build the native runtime without loading weights; inspect backend allocation and supported audio operations; only then plan a bounded, single-model-load experiment. French remains a separate acceptance gate, and an English/Chinese model is a comparator rather than a replacement for French conversation.
