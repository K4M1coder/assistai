# EXP-159: Streaming ASR cache alternatives

## Question and evidence

Can an existing implementation reduce Voxtral Realtime's streaming cache while preserving local streaming on the Intel target? This is a source and documentation comparison, not an inference benchmark.

| Runtime | Evidence | Remaining questions |
| --- | --- | --- |
| Pinned transcribe.cpp | Its [Voxtral source](https://github.com/handy-computer/transcribe.cpp/blob/275cd50/src/arch/voxtral_realtime/model.cpp) uses an FP32 encoder ring and FP16 decoder ring by default (EXP-158). Ring compaction copies backend tensor bytes using element-size offsets and a float buffer. | A quantized replacement requires correctly handling block layout, attention operations and ring movement, then testing streaming accuracy and device support. A simple type substitution is not established as safe. |
| llama.cpp current upstream | Its [server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) describes Voxtral Realtime streaming transcription over `/v1/realtime` and generic quantized K and V cache options. | The documentation does not establish that those options quantize every Voxtral audio encoder cache, that this GGUF is compatible, or that streaming works on B60. The installed SYCL build identifies itself as build 12236, commit `3d94ffe45`; support for this particular endpoint and model is unverified. |
| ExecuTorch | Its [Voxtral example](https://github.com/pytorch/executorch/blob/main/examples/models/voxtral_realtime/README.md) documents streaming, weight quantization and a configurable decoder sliding window; its example reduces that window to 2,048. | The documented backend list does not include Intel GPU. It exports the original checkpoint to its own format, not the existing GGUF. Smaller context trades away history; KV quantization, B60 support, French accuracy and memory usage are unverified. |

Voxtral is speech-to-text, not a speech-to-speech conversational model. Weight quantization and KV quantization are separate. A smaller decoder window in a different runtime cannot be assumed to preserve output quality or apply to transcribe.cpp.

## Decision and next experiment

Investigate a pinned llama.cpp build and its Voxtral model conversion and audio-encoder cache code before downloading weights or starting inference. Verify endpoint availability, quantized-cache coverage and actual backend placement, then benchmark identical French audio and measure dedicated/shared GPU memory and host RAM under a strict watchdog. The 24 GB simultaneous budget and no-spill requirement remain unproven; no model or GPU was loaded for this comparison.
