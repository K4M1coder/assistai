# EXP-194: Synthetic interruption-detector replay

Hypothesis: comparing the existing browser AEC3 output with Echoless against the same speech-onset threshold may reveal a reason to prefer one for avoiding false interruption.

The [EXP-193](2026-11-14-echoless-offline.md) twelve-second synthetic fixture and saved outputs were replayed through a three-consecutive-20 ms-frame RMS rule. A polyphase 48-to-16 kHz conversion approximates, but does not reproduce exactly, the browser capture path. The two windows are evaluated independently; counts are threshold-crossing streaks, not measured live interruptions. The signal and threshold scales are normalized to full scale.

| Signal | Threshold | Echo-only streaks, 3–6 s | Overlap streaks, 7–11 s | First overlap streak |
| --- | ---: | ---: | ---: | ---: |
| Raw microphone mixture | 2.5% | 8 | 11 | 7.38 s |
| Echoless AEC3 | 2.5% | 0 | 6 | 8.26 s |
| Browser AEC3 | 2.5% | 0 | 6 | 8.26 s |
| All three signals | 10.5% | 0 | 0 | — |

On this fixture both AEC outputs behave alike under this simplified rule; neither establishes an advantage. The high threshold also misses the synthetic overlap, illustrating why raising sensitivity thresholds can prevent both false and intended interruptions. These numbers do not establish physical-room performance, preservation or intelligibility of speech, live playback alignment, or actual end-to-end barge-in. The fixed digital echo omits reverberation, clock drift and other real-device effects. No microphone, model, GPU or real conversation was used.

Reproduce with `python scripts/evaluate-aec-detector.py .cache/assistant/echoless-offline-repeat` after generating the fixture as described in EXP-193. `python -m unittest prototype.test_aec_detector prototype.test_echoless_offline_metrics` checks the onset rule and metric calculations. The next meaningful comparison requires a consented real-device test with a known playback reference and controlled speech, measuring both self-interruptions and successful user interruptions.

## Reference-path investigation

The browser worklet pairs capture and render in 10 ms blocks from one Web Audio graph; the worker passes the render block to AEC3 before processing the capture block. This render reference is taken before the audio reaches the physical output device, and does not measure the actual acoustic path. The experimental microphone request disables the browser's built-in echo cancellation while requesting noise suppression and automatic gain control; those settings are requests and do not establish what processing the device performs. The actual playback-to-capture delay and the effects of processing are not measured in this experiment.

Upstream WebRTC's [block processor](https://webrtc.googlesource.com/src/%2B/96b951c593a2665cc8688d60343dc225f62f4e99/webrtc/modules/audio_processing/aec3/block_processor.cc) maintains a render buffer and adjusts delay before passing it to the echo remover; the [AEC3 interface](https://webrtc.googlesource.com/src/%2B/c223e2036ebeb2d0f770ccefc9cfb7efce292a47/modules/audio_processing/aec3/echo_canceller3.h) also provides an optional external buffer-delay estimate. This supports testing actual render/capture alignment, but does not prove alignment is the cause of the reported failure or that this particular browser binding exposes the optional estimate. MDN's [constraint documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getSupportedConstraints) distinguishes screen-capture `restrictOwnAudio` from microphone echo cancellation; it is not a substitute for acoustic cancellation.

## Filter failure recovery

Review of the live client found that an AEC worker failure after initialization stopped the input track but left the controls in the active state. The client now requests a partial-recognition reset, stops capture, enables speaker-safe mode and makes the microphone restart control available. The gateway only processes the reset when it is not waiting for a final ASR result. A simulated client test checks the recovery state, and the full JavaScript prototype suite passed 85 tests. This does not validate a physical worker failure or improve cancellation quality. Existing open browser tabs must reload the client to obtain the change.
