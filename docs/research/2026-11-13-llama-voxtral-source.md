# EXP-160: Installed llama.cpp Voxtral streaming implementation

## Hypothesis

The installed Intel-oriented llama.cpp build may support Voxtral streaming with a smaller audio encoder cache than the pinned transcribe.cpp implementation. The generic quantized KV switches may not apply to that encoder.

## Method and observations

The local `llama-server --version` reports build 12236, commit `3d94ffe45`. The GitHub compare API reports this commit is 561 commits ahead of the [Voxtral streaming merge](https://github.com/ggml-org/llama.cpp/pull/30629). The [README at the installed commit](https://github.com/ggml-org/llama.cpp/blob/3d94ffe45/tools/server/README.md) documents `/v1/realtime` transcription and K/V cache type switches. This is version and source evidence, not an endpoint test.

At that commit, the [encoder state allocator](https://github.com/ggml-org/llama.cpp/blob/3d94ffe45/tools/mtmd/mtmd-subcontext.cpp) allocates a separate K and V tensor per layer in FP16; its ring length is the audio attention window plus the maximum frames per encode. The [Voxtral encoder graph](https://github.com/ggml-org/llama.cpp/blob/3d94ffe45/tools/mtmd/models/voxtral-rt.cpp) uses that state. Thus the generic decoder cache switches do not establish quantized audio-encoder KV. The downloaded source files' SHA-256 hashes were respectively `9ccb051812cf7f0e8f5c2f0fcc6a503e581f958c0270555e0f623c397faee616` and `bfd2d4fff06182470833219c2b36f598efe030470afc31516a21e03136bbcc27`. No encoder allocation size is claimed without the actual projector metadata and backend alignment.

The [official llama.cpp GGUF conversion](https://huggingface.co/ggml-org/Voxtral-Mini-4B-Realtime-2602-GGUF/tree/0b0f7ac97a2bc290053ec2339b70227c59ae6386) lists a 2,551,244,000-byte Q4_K_M language model and a separate 1,063,756,032-byte Q8_0 audio projector. These are file sizes, not GPU memory requirements. The only local Voxtral file found is the 2,830,493,984-byte single-file transcribe.cpp conversion; bounded metadata inspection reports `general.architecture` as `voxtral_realtime`. Shared architecture names do not prove compatibility with llama.cpp's separate projector format. No model files were downloaded or loaded, and no GPU was initialized for this inspection.

## Conclusion and next test

The FP16 encoder state is a promising memory reduction compared with EXP-158's FP32 encoder, but ring dimensions, numerical accuracy, decoder cache quantization, latency and device placement must be measured. Before inference, obtain a verified compatible model and projector, establish sufficient GPU and host headroom, and run the same French utterances through a guarded isolated instance. Current shared-memory headroom is too close to the established reserve to assume such a load is safe. A sampled watchdog cannot guarantee no driver spill.
