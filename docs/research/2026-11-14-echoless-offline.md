# EXP-193: Offline AEC3 comparison on one synthetic path

The hash-verified Echoless Windows executable is unsigned. Its offline AEC3 command processed a synthetic 48 kHz reference and microphone mixture; no microphone, speaker, virtual driver or GPU model was used. Network access was not independently isolated or monitored. The 12-second fixture repeats synthetic English far-end speech, adds an attenuated 150 ms delayed copy to the microphone, and adds independent synthetic French near-end speech after seven seconds. It has no clipped microphone samples. This fixed digital path omits room reverberation, device scheduling, clock drift, nonlinear speaker distortion and live conversation.

| Measurement | Echoless AEC3 | Existing browser AEC3 package |
| --- | ---: | ---: |
| Echo-only reduction, 3–6 s | 66.63 dB | 66.68 dB |
| Peak signed correlation with near voice, 8–11 s, ±100 ms | -0.7665 | 0.8347 |
| Output/near RMS ratio, 8–11 s | 0.7633 | 0.7585 |

Echoless itself reported an estimated delay of 148 ms. These measurements are not intelligibility, near-end retention or real-room performance: the signed correlation can be negative due to phase and both outputs may contain residual echo. The fixed synthetic echo-only result does not resolve the reported real-speaker self-interruption. In this one case the alternative has no demonstrated advantage sufficient to replace the existing filter. Browser replay processing took 316 ms for 12 seconds on this run, excluding setup; it is not end-to-end latency or an isolated benchmark.

`scripts/probe-echoless-offline.py` creates a new explicitly named directory under `.cache`, checks the executable hash and runs both engines on the same fixture. Its generated WAV and float files contain synthetic speech and remain local. A synthetic metric unit test passed. Real-device timing, user-speech preservation, physical double-talk and no-spill behavior remain unverified.
