# EXP-205: Gradium Phonon as a local French TTS comparator

## Hypothesis

Gradium's small on-device Phonon model might improve French intelligibility or reduce synthesis resource use compared with the current Pocket TTS cascade component. It is text-to-speech, not native speech-to-speech, and cannot by itself satisfy the full-duplex model requirement. The hypothesis requires measured quality, latency and memory on this machine.

## Published evidence

The [French model card](https://huggingface.co/gradium/phonon-40m-fr) identifies a 40M French text-to-speech checkpoint. The [upstream runtime](https://github.com/gradium-ai/xn-ptts) documents Windows and Linux interfaces, CPU execution, streaming and quantization options. Its [OpenAI-compatible server](https://github.com/gradium-ai/xn-ptts/tree/main/ptts-openai-server) exposes a speech endpoint; its documentation presents Docker images for Linux, so that alone does not establish a native Windows server. Its separate WebSocket implementation supports streaming text and audio. The [Transformers description](https://huggingface.co/docs/transformers/main/en/model_doc/gradium_phonon_tts) describes a continuous-latent decoder and says the speaker codec is not released; supplied precomputed voices are used. Exact model, codec and runtime footprints, first-audio latency, French quality and coexistence with an agent remain unmeasured locally.

The French model is gated under CC BY-NC 4.0 according to the publisher; the user must review and accept its terms and provide authorized access before a French checkpoint can be obtained. The public English 31M checkpoint has a different license and is not a substitute for a French quality test. An unauthenticated HEAD request for the French config returned HTTP 401 on this machine. No credentials were read or printed, and no access conditions were accepted on the user's behalf.

## Windows runtime inventory

PyPI listed `ptts` 0.7.1 with a 6,900,834-byte Windows x64 `cp39-abi3` wheel. Installed it with NumPy 2.5.4 in a separate `.cache/phonon-env` Python 3.13 environment and imported it successfully. `build_info()` reported CPU only, AVX and F16C enabled, and 32 default threads. `available_quants()` reported `f32`, several Q8/Q6/Q5 and Q4 formats; this is an exposed option list, not proof of effective quantization for every component or of speech quality. No model was loaded or audio generated. CPU-only reports do not establish whole-system memory, CPU contention or the absence of GPU allocations in other services. The initial `py -3.12` environment command failed because that interpreter was unavailable; Python 3.13 succeeded.

## Proposed comparison

After authorized model access, pin the checkpoint revision and use a local path so the run does not require network access. Compare matching, synthetic French utterances against the existing Pocket TTS under controlled conditions: warm and cold first-audio latency, real-time factor, process private/working-set RAM, system GPU dedicated/shared counters, CPU thread counts and concurrency with the voice controller and agent. Use a small thread count as well as the default, and collect audible human ratings plus an independent ASR check; an ASR transcript is not ground truth. Include a result announcement and interruption, and verify actual streamed chunks and cleanup. Evaluate both baseline and quantized formats only after confirming supported combinations. No benchmark or improvement claim is made yet.
