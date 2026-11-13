# EXP-168: Browser speech recognition with a competing synthetic voice

We mixed the existing Microsoft Hortense French question from EXP-167 with the existing Microsoft Zira English utterance, repeated to the French duration and scaled by 0.35. The 5.75-second mixture had a whole-clip nominal target-to-interference RMS ratio of 8.46 dB and no clipped samples; this ratio is not a per-voice activity measurement. Two seconds of silence preceded it and three followed it. No microphone, GPU model load, or physical room was involved.

With the 1.4-second endpoint and transcript review enabled, the fake-microphone Chrome test returned `bonjour assistant puis veux-tu me raconter une petite anecdote sur la lune rose`. Direct Vosk processing of the same mixture returned `bonjour six puis tu me raconter une petite anecdote sur la lune arnaud`. The clean direct baseline in EXP-167 returned `bonjour assistant peux-tu me raconter une petite anecdote sur la lune`. The browser and direct paths do not have identical processing, and each condition was run once; this is not a controlled browser-versus-direct benchmark or a real-room test. Both mixture outputs differ from the clean result and add an unrelated trailing word. Review prevents automatic submission until the user accepts or edits the text, but it cannot itself separate speakers.

Reproduce after preparing the pinned synthetic fixtures described in EXP-167 and starting the local services:

```powershell
.\.venv-voice\Scripts\python.exe scripts/make-synthetic-browser-mixture.py .cache/assistant/browser-noisy-new.wav
node scripts/probe-browser-speech-review.mjs .cache/assistant/browser-noisy-new.wav
```

The generator refuses to overwrite an existing file. The reproducibility run produced the same SHA-256 as the original mixture: `78e077b84fcf2f566d5007c64896fc56af994f677c9f68a10cd7f8bc26e85559`. The generated WAVs and disposable browser profile remain in local temporary storage following the prior automatic cleanup rejection.
