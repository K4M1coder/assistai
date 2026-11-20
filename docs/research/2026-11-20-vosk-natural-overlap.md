# Natural French competing-speech probe

## Hypothesis and protocol

The running Vosk recognizer may lose a target utterance when another person speaks at the same time. This matters even with push-to-talk: the button controls when recording occurs, not whose voice is recorded. The experiment directly sends fixed, non-personal research audio to the already-running loopback Vosk WebSocket at approximately real time; it does not open a microphone or exercise the browser's noise gate, push-to-talk, echo cancellation or physical room acoustics.

Two French test utterances originate from [Google FLEURS](https://huggingface.co/datasets/google/fleurs), attributed to A. Conneau et al. (2022), CC BY 4.0, using the [pinned re-encoded fixture dataset](https://huggingface.co/datasets/podscripter-project/test-fixtures/blob/6e1c1eced6e68bb35b1f1d89c56478229201a2f7/README.md). The target is utterance `17559822372056259463`, reference `Cela semble raisonnable, car la Terre n'a pas l'impression de bouger, n'est-ce pas ?`; the competing voice is the first 5.04 seconds of utterance `118005971910520590`. Both are 16 kHz mono PCM16 and their exact source hashes and metadata are documented in [the earlier natural-speech record](2026-11-17-kyutai-persistent.md). Respect attribution and license requirements if redistributing audio.

`$env:PYTHONIOENCODING='utf-8'; .\.venv-voice\Scripts\python.exe scripts\probe-vosk-natural-overlap.py` multiplies the target PCM by 8 and adds the beginning of the other recording at gain 0, 32 or 64, respectively. These gains compensate for the files' different levels; the script rejects clipping. The signals are summed without room impulse responses or spatial processing, and the competitor is cropped to the target's duration. The first five seconds of the longer second utterance need not correspond to its full transcript. The service reported `Vosk`, `vosk-model-small-fr-0.22`, French, 16 kHz. No model was added or loaded for this experiment.

## Results, 2026-11-20

The target RMS was 1,417.45 PCM units across all cases. Normalized target word error rate (WER) uses the tokenizer in `scripts/probe-asr-coding.py`; lower is better.

| Competing gain | Competing RMS | Peak | Target WER | Transcript |
| --- | ---: | ---: | ---: | --- |
| 0 | 0 | 22,632 | 0.059 | `cela semble raisonnable que la terre n'a pas l'impression de bouger n'est-ce pas` |
| 32 | 820.36 | 22,600 | 0.882 | `cela semble régner rap interne impressionne allégé paresseux des bottes d'équipe` |
| 64 | 1,640.72 | 22,568 | 0.824 | `cela semble premièrement à la plupart des cavaliers porte des bottes d'équipe` |

The hashes of the actual mixed PCM are, respectively, `8ccebef039fa97a81a21889e7763da592fba8c91ec040e1880d25a73f7628b75`, `14d8c481ff3d71eefce64a7aae961d27bfb7adaf3b8b8958f2e4bad3e2f85840` and `17ea273dbface81754a0519a03816eba4337f2289aab899d19e6a1d9dfa290e8`. The two voices overlap from the start; no actual loudspeaker playback was used. The competing speech severely degraded this target in these two mixtures and influenced the second transcription. The gain-64 WER being slightly lower than gain-32 does not imply better target recognition; neither was accurate. This one pair of utterances is not a population benchmark, a TV/music test, or proof of speaker isolation failure for every room. Push-to-talk reduces unwanted capture periods but cannot isolate overlapping speakers. Test candidate suppression against the same mixtures and negative controls before integrating it.
