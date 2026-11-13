# EXP-158: Voxtral streaming KV source and metadata estimate

## Hypothesis and method

The generic API in EXP-157 did not establish the family-specific cache representation. We inspected `model.cpp` from the exact transcribe.cpp commit `275cd50` reported by the installed library. Its Git blob SHA-1 matched the GitHub tree (`13bd065233716ae6610cd6cebf31e73624117585`). The [pinned streaming implementation](https://github.com/handy-computer/transcribe.cpp/blob/275cd50/src/arch/voxtral_realtime/model.cpp) allocates an encoder KV ring with 1,536 positions in FP32 and a decoder ring using the GGUF sliding window in FP16 unless FP32 is requested. The [pinned KV allocator](https://github.com/handy-computer/transcribe.cpp/blob/275cd50/src/causal_lm/causal_lm.cpp) accepts only FP16 or FP32 for these tensors.

`scripts/inspect-voxtral-cache.py` reads bounded metadata from an explicitly selected GGUF without loading tensor weights or initializing a backend. The local checkpoint reported encoder dimensions 32 layers, 32 heads and 64 per head; decoder dimensions 26 layers, 8 KV heads, 128 per head and an 8,192-position sliding window. Applying the implementation's K and V tensor geometry yields:

| Streaming tensor | Estimated bytes | MiB |
| --- | ---: | ---: |
| Encoder KV, FP32 | 805,306,368 | 768 |
| Decoder KV, FP16 | 872,415,232 | 832 |
| Combined KV tensors | 1,677,721,600 | 1,600 |

The reader consumed 7,862,256 bytes of metadata, not the model tensor data. Three tests passed, including a synthetic metadata fixture, truncated-file rejection and an ABI-layout test.

## Interpretation

These are tensor-size estimates from source and metadata, not actual B60 allocations. The 2,830,493,984-byte GGUF on disk, model weights in memory, alignment, compute graphs, work buffers, driver allocations, other models and session concurrency are additional and may differ from file size. The exposed `n_ctx` does not lower the trained decoder ring in this implementation. It does not meet the requested quantized-KV preference as written; changing precision requires implementation and quality testing, not a flag assumption. No model or Vulkan backend was loaded during this experiment.

Next, compare other runtimes or a carefully validated quantized-cache implementation and assess the full simultaneous budget before a guarded B60 test. This ASR candidate is not a native conversational speech-to-speech model.
