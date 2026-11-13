# EXP-155: Synthetic coding ASR comparison

## Protocol

The guarded Windows runner synthesized three fixed French coding phrases with the existing local Pocket TTS service and sent identical PCM to the loaded Vosk sidecar and the pinned CrispASR CPU FastConformer Q8 candidate. The candidate processed a temporary synthetic WAV in a new process for each case. The test used no physical microphone or speaker. Its 8 GiB RAM preflight and sampled 6 GiB RAM, 22 GiB dedicated GPU and 256 MiB absolute shared-GPU stop thresholds are advisory rather than hard limits.

The first two candidate attempts timed out after 45 seconds on the first phrase. The second captured stderr showing that the runtime loaded an auxiliary punctuation component and waited at a prompt to download a language-identification model. This was not a measured 45-second inference time. The probe now explicitly selects French, disables language identification and punctuation, and supplies non-interactive stdin. The corrected third run completed. No network isolation was independently measured, so the flags do not prove the binary could never access the network.

## Observations

| Synthetic case | Vosk normalized WER | FastConformer normalized WER | Observation |
| --- | ---: | ---: | --- |
| Addition instead of subtraction | 0.083 | 0.083 | Both retained the operation words and their order; the candidate added an initial word. |
| Do not delete the file | 0.125 | 0.000 | Both retained the negation markers; Vosk changed another word. |
| `calculator` point `py` | 0.200 | 0.300 | Neither retained `calculator`; the candidate also missed `py`. |

The candidate's file-process timings including a fresh model load were 453, 297 and 297 ms. Vosk timings included real-time-paced audio submission to an already loaded service and were 3,828, 3,953 and 3,968 ms; these are not comparable live latency measurements. Across 16 whole-system samples, minimum available RAM was 8,802,914,304 bytes, maximum dedicated GPU use 16,316,334,080 bytes and maximum shared GPU use 266,584,064 bytes, close to the conservative shared threshold. Sampling cannot prove no transient peaks, RAM spill or paging. No synthetic WAV remained after normal completion; forced termination can still leave one.

## Interpretation

This single synthetic voice and three phrases do not justify replacing Vosk or claiming a general accuracy ranking. Both failed the exact filename case, and marker order is not a semantic guarantee. The candidate runtime does not advertise native streaming for this backend, and real microphone, interruption, broad French vocabulary, concurrency and audible quality remain untested. Next, use a larger consented corpus with filenames and semantic contrasts, measure actual streaming alternatives and resource usage, and retain the optional transcript-review feature for user correction.
