# EXP-192: Browser input selector with synthetic audio

The browser probe now accepts an explicitly configured credential-free loopback gateway and checks that its gateway history is volatile. With Chrome fake-device and fake-audio flags and the existing synthetic French WAV, the current gateway on port 18095 displayed the complete synthetic question in transcript review without submitting a turn. Chrome listed three input options. The test selected a non-default reported input, restarted capture, and observed that the selected device ID was passed as an exact `getUserMedia` constraint and capture restarted.

No physical microphone, virtual audio driver, model inference or agent task was used. This demonstrates browser control and fake-device routing, not real device identity, echo cancellation, audio quality or automatic barge-in. Device IDs and labels were not recorded in the result. The headless test profile remains at `C:\Users\cthed\AppData\Local\Temp\assistai-audio-OJBe7H`; previous attempts to clean equivalent disposable profiles were rejected by automatic command review.

Reproduce only with a synthetic PCM WAV and a loopback gateway whose history is volatile:

```powershell
$env:ASSISTAI_TEST_BROWSER_URL='http://127.0.0.1:18095/'
$env:ASSISTAI_PROBE_RESELECT='1'
node scripts/probe-browser-speech-review.mjs .cache/assistant/browser-audio-test.wav
```
