# EXP-203: Community GGUF VoiceChat implementation review

## Hypothesis

A quantized native full-duplex model with a structured tool channel could satisfy the voice-to-agent requirement with less GPU memory than an unquantized runtime. That remains unproven for French and Intel B60.

## Sources and observations

[NVIDIA's VoiceChat model card](https://huggingface.co/nvidia/NVIDIA-NemotronLabs-VoiceChat-11B) describes a single 11B speech system with a distinct tool-call output channel and labels the model English. Its [paper](https://arxiv.org/abs/2609.21967) reports full-duplex and tool-call evaluations; those numbers are publisher results, not measurements on this machine.

The independent [`llama-voicechat.cpp` fork, revision `f45001fc3d8013c72beb6753d3eb0b976b6a9fff`](https://github.com/sansamour/llama-voicechat.cpp/tree/f45001fc3d8013c72beb6753d3eb0b976b6a9fff), documents a 12.5 Hz duplex timeline, a function-head event stream, a JSON-lines service and a tool-response command. Its author describes an unofficial [Q4 conversion](https://huggingface.co/hoidhxd/NVIDIA-NemotronLabs-VoiceChat-11B-GGUF) split into four files: approximately 4.67 GiB backbone, 315 MiB function head, 435 MiB perception encoder and 686 MiB speech generator/codec. The conversion repository resolved to revision `89883a05a031557729771f94abb9998e4facdd45` during this review. These are file sizes and author claims, not observed VRAM or quality. Original model license conditions apply; review them before use or redistribution.

The fork's [pinned technical notes](https://github.com/sansamour/llama-voicechat.cpp/blob/f45001fc3d8013c72beb6753d3eb0b976b6a9fff/tools/voicechat/README.md) report that its multilingual tests produced English answers or unusable output, and describe freezing incoming audio during the tool-call region. That is a significant mismatch with the requested French conversation and continued listening during background work. The developer also describes substantial tool-list prefill time on their test; this is not a B60 measurement. Their published Windows packages are CPU and CUDA; a Vulkan B60 build, execution, full duplex under load, tools, and concurrent memory use were not verified here.

## Decision

Retain this as an English full-duplex/tool-protocol comparator and a source for implementation ideas, not the French product path. Before a local test, inspect and build a pinned Vulkan runtime in isolation, review conversion provenance and license, and measure the four models, caches, audio buffers and agent simultaneously under a hard budget. An adapter would also need to address its documented tool-region input freeze and verify cancellation, task results and context; it cannot simply be treated as equivalent to our existing bridge. No binary or weights were downloaded or run in this review.
