# EXP-151: Quantized Kyutai STT candidate inventory

## Hypothesis and evidence

Kyutai's [STT description](https://kyutai.org/stt/) identifies `stt-1b-en_fr` as an English/French streaming model with semantic voice activity detection. The upstream [Rust implementation](https://github.com/kyutai-labs/delayed-streams-modeling/blob/main/stt-rs/src/main.rs) contains a GGUF quantized model-loading branch and a CPU device option. It also reads a configuration, tokenizer and separate Mimi audio codec; the reference CLI takes an audio file. This source-level evidence does not establish that the locally downloaded conversion works, that the CLI is a streaming server, or that it accelerates on Intel Arc.

The local `efficient-nlp/stt-1b-en_fr-quantized` directory contains `model-q4k.gguf` at 556,669,792 bytes and `config.json`, which specifies a 0.5-second audio delay and names `mimi-pytorch-e351c8d8@125.safetensors` and `tokenizer_en_fr_audio_8000.model`. Neither named companion file was in the model directory or in the inspected LM Studio model tree and workspace Hugging Face cache. `cargo` was not on PATH, and the standard per-user Rust toolchain paths were absent. These checks do not prove the files or toolchain are absent everywhere on the machine.

## Practice and limitations

`scripts/inspect-kyutai-stt.py` reports configured companion files and GGUF sizes for an explicitly selected directory without loading a model or contacting the network. Three tests passed across inventory path validation and ASR metric checks. No model, runtime or dependency was downloaded, built or loaded. The GGUF size is an on-disk size, not VRAM or total RAM; codec, context, runtime and concurrent voice/agent allocations remain additional.

Before comparing accuracy against Vosk, identify compatible pinned codec and tokenizer files, verify provenance and licensing, establish an offline Windows runtime and quantify its disk, RAM and latency costs. Only run under the existing guard when headroom returns. The first comparison should use the same fixed coding phrases from EXP-145, then real consented audio and interruption tests. This candidate does not replace the requested speech-to-speech voice architecture by itself.
