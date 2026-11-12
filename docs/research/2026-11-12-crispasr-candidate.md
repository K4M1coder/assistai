# EXP-152: Local CPU ASR runtime candidate

## Hypothesis and source review

An existing compact French FastConformer GGUF may offer a practical recognition comparison without the separate Kyutai codec and Rust toolchain. The [model publisher](https://huggingface.co/cstr/stt-fr-fastconformer-hybrid-ctc-large-GGUF) describes a French CTC conversion for CrispASR and identifies its CC-BY-4.0 license. The local Q8 file is 117,361,632 bytes on disk; its presence is not proof of compatibility, integrity, runtime memory or accuracy.

The [CrispASR project](https://github.com/CrispStrobe/CrispASR) documents Windows CPU builds, FastConformer and Kyutai backends, and separately describes a Windows Vulkan build. The installed research binary below is CPU only; it is not evidence of B60 acceleration. Its capability JSON does not list `streaming` for `fastconformer-ctc` or `kyutai-stt`, although it does list streaming for some other backends. File transcription or rolling windows must not be described as verified native streaming.

## Practice

The pinned [v0.8.53 Windows CPU release](https://github.com/CrispStrobe/CrispASR/releases/tag/v0.8.53) was downloaded into a new workspace cache directory by `scripts/setup-crispasr-cpu.py`. The 9,473,398-byte archive matched SHA-256 `6dbb713c537248d76dde3384f0f62676ff275248774e93dbb7281f655c2e5db5`; archive paths and expanded size were checked before extraction. `crispasr.exe --version` reported version 0.8.53, git SHA `1694d8ef`, Windows x86-64 and CPU backend. `--list-backends-json` reported both candidate backends. No model, server or physical audio device was opened. The checksum pins the release bytes but does not prove binary trustworthiness.

The Kyutai Candle reference companion metadata at repository revision `095e38f6242006a93c2541149b181988397f5c7c` lists a 384,644,900-byte Mimi file and a 120,378-byte tokenizer; these were not downloaded. The 556,669,792-byte local Candle-format Q4 file is a different packaging from the [CrispASR Kyutai conversion](https://huggingface.co/cstr/kyutai-stt-1b-GGUF); do not assume one can substitute for the other.

## Next step

When the 8 GiB preflight permits, use fixed synthetic WAV inputs and an explicit local model path in an isolated, guarded CPU comparison. Record accuracy, initialization, per-utterance latency, process and system RAM, GPU counters and disk activity; avoid automatic model downloads. This is not yet a live ASR service, and the existing demo still uses Vosk.
