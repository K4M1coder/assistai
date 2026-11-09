# Noisy-room research: overlapping voices

The user reports TV, music, and other people talking in the same room. They also report the speaker-safe playback mode improved the previous cutouts. Push-to-talk gates audio between turns but cannot separate sounds mixed with the user's speech. The browser requests noise suppression and echo cancellation, but their actual implementation and effectiveness depend on the browser and microphone; these settings are not proof of separation.

## Evidence and distinction

- [Silero VAD's implementation](https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py) scores speech activity in 512-sample windows at 16 kHz and retains context/state. It can improve turn detection, but speech on TV or from another person is still speech. It does not isolate the intended speaker.
- [RNNoise](https://github.com/xiph/rnnoise) provides a local neural noise suppressor, with a 48 kHz PCM reference implementation. It may help non-speech noise; its documentation does not establish suppression of a competing speaker or improvement in French ASR here.
- [SpeakerBeam-SS](https://www.isca-archive.org/interspeech_2024/sato24_interspeech.pdf) studies causal target-speaker extraction using enrollment speech; its reported relative real-time-factor improvement is a result under the paper's conditions, not a measurement on this PC. An implementable checkpoint, license, CPU performance, and streaming integration remain to be verified.
- [WeSep](https://github.com/wenet-e2e/wesep) is an Apache-2.0 toolkit with target-speaker extraction implementations. [Real-TSE baseline](https://github.com/REAL-TSE/wesep-real-tse) describes pretrained inference from a mixture and enrollment recording. Offline-file inference is not evidence of causal streaming. Check the specific checkpoint's license separately and measure its CPU memory, algorithmic latency, and accuracy before integration.

## Experiment EXP-012

Run `.venv-voice/Scripts/python.exe scripts/probe-asr-interference.py` with the local ASR service already running. The script does not record a microphone and reuses the existing ASR model; no GPU model is loaded. The source is the untracked local synthetic French test WAV with SHA-256 `de7a02ac447c49526f3ee76336ab6268ee7af389881150042fbe75fe86a612c7`. It is resampled to 16 kHz, then mixed with a deterministic shifted copy of itself or seeded white noise at 10 and 0 dB whole-clip SNR. Peak scaling prevents clipping. These are stressors, not representative TV, music, a second speaker, or a room impulse response. No clean ground-truth transcript was saved for the original TTS generation, so no WER is claimed.

On the running Windows/Vosk small-French service, the clean result was `bonjour je suis votre assistant vocal local`; shifted-speech 10 dB added words, and 0 dB corrupted the transcript. Both white-noise conditions yielded unrelated text. Processing times for 2.68 s of audio ranged from 1.28 to 2.61 s, but requests were submitted in a burst and the host was concurrently running other services: these are neither streaming latency nor a controlled CPU benchmark. The source and results are a single synthetic example, insufficient to rank models or claim a real-world error rate.

## Next tests

1. Acquire a small consented, diverse French corpus with separate clean speech, competing speech, TV/music, and room recordings; keep recordings local and untracked. Evaluate word error rate and unintended activation separately.
2. Measure the current browser microphone settings and compare close-talking with far-field capture. Compare optional local noise suppression and streaming VAD on identical recordings before enabling them by default.
3. Identify a reproducible licensed causal target-speaker checkpoint and enrollment method. Evaluate separation plus ASR together, clean-speech degradation, voice mismatch, latency, CPU/RAM, GPU/shared-memory and page-file deltas under concurrent voice and agent workloads. Stop if it threatens the 24 GB and RAM budgets.
