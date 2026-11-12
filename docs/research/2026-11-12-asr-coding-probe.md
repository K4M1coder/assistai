# EXP-145: Prepare a constrained ASR coding benchmark

## Hypothesis and method

The failed EXP-144 task lost a filename and the direction of an arithmetic change. Before testing another write-capable agent, compare speech recognition alone on three fixed synthetic French examples: an operation contrast, a negation and a filename. The new probe synthesizes input with the existing local TTS, replays it in 100 ms chunks to the existing Vosk service, and records each transcript, normalized word error, marker presence and order. It does not start an agent, open physical audio devices or save audio. A token-order match does not establish that the operation or negation was understood correctly.

The Windows runner samples system memory and adapter counters, requires 8 GiB available RAM before starting, and stops its own probe below 6 GiB, above 22 GiB dedicated GPU use or above 256 MiB absolute shared use. These are advisory sampled guards, not hard allocation limits.

## Observation and limitations

A unit test verified the word-error calculation on identical and missing-word examples. The first guarded benchmark invocation rejected preflight and did not start inference. A subsequent demo resource snapshot showed 6,966,317,056 bytes available RAM, 16,039,333,888 bytes dedicated and 263,208,960 bytes shared GPU use; the snapshot was taken after the rejected preflight, not as its exact measurement. No recognition benchmark result is available.

The workload consists of one synthetic voice and three phrases, with no live room noise or speaker diversity; it cannot establish general French accuracy. The filename was deliberately outside the ordinary French vocabulary. Run the same cases against candidate recognizers only when headroom permits and compare exact transcripts and direction, not only aggregate word error. Larger Vosk models or other runtimes must be measured against both RAM and VRAM budgets before adoption.
