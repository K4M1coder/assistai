# EXP-157: Voxtral runtime ABI and KV controls

## Hypothesis and method

Before a guarded streaming probe can load the local model, the pinned DLL's C ABI must match any Python bindings. `scripts/transcribe_abi.py` declares three structures from the [v0.4.2 API header](https://raw.githubusercontent.com/handy-computer/transcribe.cpp/v0.4.2/include/transcribe.h): model-load parameters, session parameters and streaming text. It queries the native size and alignment of each and refuses zero or mismatched values before calling native initializers. The existing runtime probe also checks its pinned contract and version, forces CPU backend discovery, and loads no model or audio device.

## Observations

The local library reported matching sizes and alignments for all three structures. Native initializers returned consistent structure sizes, `kv_type` AUTO and `n_ctx` zero. One unit test confirmed that mismatched and unknown sizes are rejected. The library initialized the CPU backend only; Vulkan and model loading were not attempted.

The same versioned header documents its generic encoder flash-attention KV choices as AUTO, FP32 and FP16, with AUTO selecting FP16 for quantized weights. It also says the generic `n_ctx` cap is ignored for Voxtral Realtime. These facts do not identify every model-specific decoder cache or prove the runtime's actual allocations, but they mean the user's requested quantized-KV configuration and a generic context cap cannot be assumed for this candidate.

## Next step

Inspect the version-pinned family implementation for cache precision and bounds, then prepare an explicitly device-selected, isolated streaming probe with reliable process cleanup and resource telemetry. Do not load the 2.83 GB checkpoint into the current near-threshold shared-GPU configuration or claim a 24 GB/no-spill guarantee without measurements. The upstream source describes ASR, not a complete speech-to-speech assistant.
