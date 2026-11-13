# EXP-156: Voxtral streaming-ASR runtime preparation

## Hypothesis and source evidence

Both recognition candidates in EXP-155 missed an exact filename. The machine already has `Voxtral-Mini-4B-Realtime-2602-Q4_K_M.gguf`, 2,830,493,984 bytes on disk. [Mistral describes Voxtral Realtime](https://mistral.ai/news/voxtral-transcribe-2/) as streaming ASR with French among its supported languages. The [transcribe.cpp model documentation](https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/voxtral-realtime.md) describes a GGUF implementation with incremental streaming and adjustable delay. These are upstream claims, not measurements on this B60 or evidence of speech-to-speech generation.

## Runtime preparation

The pinned [transcribe.cpp v0.4.2 Windows CPU/Vulkan release](https://github.com/handy-computer/transcribe.cpp/releases/tag/v0.4.2) archive was downloaded to a new workspace cache location. Its 18,052,817 bytes matched SHA-256 `6094102cf57b404b050707ceb258b12ce647b92e801b5d46077214e5b030c8aa`; the setup checks expanded size and rejects unsafe paths, links and special archive entries. The release contains a shared library and backend modules, not a CLI.

The library reported version `0.4.2`, commit `275cd50`, matching its contract. A separate process forced `TRANSCRIBE_BACKENDS=cpu`, initialized one CPU device and exited without opening a model or audio device. It did not initialize Vulkan and therefore does not establish B60 support. No ASR transcript, latency, model residency or total memory measurement was obtained. The checksum pins bytes, not their trustworthiness.

The [versioned API header](https://raw.githubusercontent.com/handy-computer/transcribe.cpp/v0.4.2/include/transcribe.h) specifies a 16 kHz mono float32 streaming feed, size-aware structs and a pre-1.0 ABI. It also warns that concurrent compute on one model is not supported. A production adapter must verify the ABI, serialize access and handle cancellation; no such adapter is implemented here.

## Next step and resource constraint

Before loading the model, prepare an isolated, bounded streaming probe with explicit device selection and whole-system RAM, dedicated/shared GPU and disk observations. The preflight snapshot showed 9,808,621,568 bytes available RAM and 265,535,488 bytes shared GPU use, only about 2.8 MiB below the conservative shared threshold. The 2.83 GB GGUF size excludes KV cache, runtime and buffers. No model or Vulkan device was loaded under these conditions. Test on the target B60 and compare the same French coding phrases only when headroom permits; preserve the 24 GB requirement without relying on host or disk spill.
