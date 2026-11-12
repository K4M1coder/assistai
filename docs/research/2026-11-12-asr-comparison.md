# EXP-153: Prepare a same-audio ASR comparison

## Hypothesis and protocol

The already installed CrispASR CPU runtime and existing French Q8 FastConformer checkpoint might recognize operation direction, negation or filenames better than the current Vosk baseline. The prepared `scripts/run-asr-coding-probe.ps1 -CompareCrisp` synthesizes each fixed French phrase once, feeds the same PCM to Vosk and the file-oriented CrispASR CLI, and records each transcript, normalized word error and marker presence/order. It uses an explicit local model path and `-ng` CPU mode, and does not invoke an agent or physical audio device.

The candidate CLI receives a temporary synthetic WAV under `.cache`; normal exit removes it, while forced termination may leave it. The watchdog attempts to stop only the exact candidate executable descended from the owned probe. The candidate starts a new process and loads its model for each case; Vosk is already loaded and receives real-time-paced chunks. Their recorded elapsed times are therefore not equivalent live latency measurements. Neither word error nor marker order proves semantic correctness.

## Verification and limits

Two Python tests passed, including a mocked candidate invocation that verified a WAV input and its normal cleanup. The first guarded comparison attempt rejected preflight before model or speech inference, so there are no comparative transcripts, memory or latency results. The guard still requires 8 GiB available RAM and stops below 6 GiB, above 22 GiB dedicated GPU or above 256 MiB absolute shared usage; sampling is not hard enforcement. Real candidate compatibility, forced-stop cleanup, audio quality and live streaming remain unverified. The runtime capability list does not advertise native streaming for this backend.

Run the prepared comparison only when headroom permits. Inspect actual transcripts and operation direction, measure resource peaks, and then extend beyond three synthetic phrases before drawing conclusions or changing the demo recognizer.
