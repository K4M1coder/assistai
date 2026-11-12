# Source review: B60 local voice and agent prototype

Status: research and initial hardware inspection, not an end-to-end validation. Checked 2026-11-09.

| Candidate | Evidence | Implication for this project |
| --- | --- | --- |
| [Gradbot](https://github.com/gradium-ai/gradbot) | Rust multiplexer coordinates streaming STT, LLM, TTS, interruptions and asynchronous tools; its documented speech providers are Gradium APIs. | Strong orchestration reference; documented defaults do not satisfy local-only voice. Do not call it an offline speech runtime. |
| [Moshi](https://github.com/kyutai-labs/moshi/blob/main/FAQ.md) | The released Moshi model is described as English-only in the project FAQ. Its full-duplex design is described in the [paper](https://arxiv.org/abs/2410.00037). | Useful full-duplex comparator, but unsuitable as the sole French voice path without additional evidence. |
| [Realtime-Venus](https://github.com/inclusionAI/Realtime-Venus) | A 9B native full-duplex audio/vision frontend delegates asynchronously to a separate harness. Its published demo requires an NVIDIA A100 and Linux; the model card tags English and Chinese. | Strong architectural reference but not yet a B60/French candidate: the local code review found CUDA-specific initialization, and local OpenCode execution requires an adapter. See EXP-121. |
| [Kyutai Unmute](https://github.com/kyutai-labs/unmute) | STT, LLM and streaming TTS are separated; the published setup requires CUDA and Linux or WSL, with native Windows unsupported. Reported standalone components use 2.5 GB STT and 5.3 GB TTS VRAM. | Its architecture and turn-taking are valuable references. Its documented deployment cannot establish B60/native-Windows support. |
| [Kyutai STT](https://github.com/kyutai-labs/delayed-streams-modeling) | `stt-1b-en_fr` is documented as English/French, streaming, with 0.5 s delay and semantic VAD. | Evaluate the existing local GGUF assets with a compatible runtime; a GGUF file alone does not prove execution. |
| [Kyutai Pocket TTS](https://github.com/kyutai-labs/pocket-tts) | Project documents CPU inference, streaming and French. Its latency figures are hardware-specific. | High-priority candidate: CPU execution could reserve GPU memory for the coding model. Measure French voice quality, latency and interruption on the Ryzen 3950X. |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Documents cross-vendor Vulkan and a real-time microphone example. | Alternative baseline; verify streaming behavior and French accuracy on this exact setup. |
| [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) | Documents local OpenAI-compatible chat, multimodal inputs, tool calls and separate client tool execution. | Candidate agent/vision inference backend. Validate the specific LM Studio backend, model, template, image projector and tool calls locally. |
| [OpenCode server](https://docs.opencode.ai/docs/server/) | Documents loopback HTTP server, asynchronous prompts, sessions and SSE event stream. | Candidate harness adapter; test real local-model provider, permissions, cancellation and event handling. |

## Hardware and installed assets

Windows registry identifies **Intel Arc Pro B60**, driver **32.0.101.8805**, and **AMD Ryzen 9 3950X**. `llama-server --list-devices` from the installed LM Studio Vulkan backend detected `Vulkan0` with **21,316 MiB reported**, **20,547 MiB free** at inspection; these are backend-reported available figures, not total physical VRAM or peak measurements. Windows WMI queries returned access denied.

Installed assets include `Qwen3.8-27B-Q4_K_M.gguf` (16,810,714,336 bytes), its BF16 vision projector (931,145,856 bytes), several Kyutai STT GGUF variants, and LM Studio's Vulkan `llama-server`. Their existence does not establish compatibility, accuracy or performance. The 27B and projector disk sizes add to approximately 16.52 GiB, before KV cache, buffers, runtime, speech and display.

## Hypothesis updates

- H-01: plausible enough to test, but the original independent upper bounds sum to more than physical VRAM. Evaluate simultaneous peaks, not model file size alone.
- H-02/H-04: the cited sources do not demonstrate the proposed thresholds on this machine. A cascaded streaming implementation with barge-in does not by itself prove native full-duplex conversational behavior.
- H-05/H-06: baseline Moshi English-only support weakens its suitability for French. Compare it separately; prioritize French-capable STT and TTS.
- H-03: OpenCode's API supports programmatic delegation, but API availability does not prove a sandbox or safe permission enforcement. Test them separately.

## Follow-up, 2026-11-10

[Upstream llama.cpp issue #22034](https://github.com/ggml-org/llama.cpp/issues/22034) contains reports of Vulkan device loss on Intel Arc and a workaround disabling cooperative matrices. A commenter reports that a newer driver resolved their reproduction; that does not prove the cause on this machine. Our tests with `GGML_VK_DISABLE_COOPMAT=1` produced successful structured tool calls and a simple vision response (EXP-006), but do not establish sustained stability. Do not alter driver or operating-system settings automatically.

[Vosk](https://alphacephei.com/vosk/models) offers a streaming, CPU-capable French model under Apache 2.0; its published error rates indicate that the small model is a baseline rather than a quality guarantee. EXP-007 tested one synthesized phrase. [Moonshine's current model list](https://github.com/moonshine-ai/moonshine/blob/main/docs/models/available-models.md) does not list French STT, so it is not a French recognition candidate on this evidence.

## Acceleration and edge-model follow-up

[llama.cpp SYCL documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/SYCL.md) describes XMX Flash Attention on Xe2 with symmetric Q8/Q4 KV caches and a BMG VRAM allocation check designed to refuse oversubscription rather than spill to host memory. It also documents a Level Zero allocation path that may reduce host staging. These are candidates for a controlled Windows B60 comparison, not verified benefits for this machine or this installed build. Intel oneAPI 2026.0 and 2026.1 are present locally.

The 12B QAT Q4_0 model and the edge-oriented [LFM3 1.7B GGUF](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF) both ran with `-fa on -ctk q8_0 -ctv q8_0` on Vulkan. EXP-009 is a short functional test, not a quality or long-context benchmark. Quantized KV can affect both quality and throughput; compare Q8, Q4 and F16 under identical workloads rather than assuming a smaller cache is always faster. The small controller's license must be reviewed before redistribution; the model card does not identify it as Apache/MIT.

## Native duplex and alternative TTS follow-up

The [Hugging Face speech-to-speech](https://github.com/huggingface/speech-to-speech/tree/ebc09bf286edbe8739a59575709070f056d31e29) project is a cascaded local voice-agent comparator with a packaged native client and an optional timestamp-aligned AEC3 path. Its Windows CI matrix and B60 behavior do not establish support on this machine. EXP-068 tests only its underlying AEC binding on synthetic data; the native client and real speaker interruption remain untested.

[NVIDIA NeMo-Speech.cpp](https://github.com/NVIDIA/NeMo-Speech.cpp) documents local speech services, streaming ASR/TTS, and an implementation of NemotronLabs VoiceChat with full-duplex audio and tool calling. Its general runtime includes Windows and Vulkan paths, but the [VoiceChat-specific guide](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/s2s/README.md) recommends CUDA with at least 16 GB of GPU-accessible memory. The [11B model card](https://huggingface.co/nvidia/NVIDIA-NemotronLabs-VoiceChat-11B) lists English, not French. Therefore neither Intel B60 execution nor French dialogue is established by these sources, and coexistence with the coding model inside 24 GB must not be assumed. This is a full-duplex comparator for later investigation, not a replacement for the current French path without evidence.

The same runtime documents [MagpieTTS Multilingual](https://huggingface.co/nvidia/magpie_tts_multilingual_357m), whose model card includes French, as a potential CPU or GPU TTS comparator. Its published latency figures use different hardware and must not be transferred to this machine. Verify model licensing, Windows backend coverage, quality and combined memory before adoption. The present VAD-driven cascade provides interruption mechanisms, but it has not demonstrated native full-duplex dynamics or the assistant's ability to interrupt a user naturally.
