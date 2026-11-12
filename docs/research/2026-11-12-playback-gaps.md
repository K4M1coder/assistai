# EXP-139: Diagnosing choppy French speech

## Observation and hypothesis

The user reported intermittent unintelligible French speech. Possible causes include model pronunciation and discontinuities between streamed audio chunks. The browser previously did not report whether its audio schedule had run out of queued samples before the next chunk arrived.

## Implementation and evidence

Within one speech stream, the browser compares the audio clock at chunk arrival with the previously scheduled playback end. If the queue has been empty for over 30 ms, it counts a gap and logs its duration at stream end. A mock audio-clock test created one 200 ms gap and observed one diagnostic; six targeted client, formatting and integration tests passed. The added scheduling lead and hardware output latency are not measured. Event-loop delays, suspended contexts and clock behavior can affect this signal; a clean report does not establish that speech was intelligible.

The active local server uses Pocket TTS 4.0.1 `--language french`; its installed configuration has six transformer layers and selects the default French voice `estelle`. The installed `french_24l` configuration uses 24 layers. Kyutai describes [the larger model as undistilled](https://github.com/kyutai-labs/pocket-tts/releases) and provides its [configuration](https://github.com/kyutai-labs/pocket-tts/blob/main/pocket_tts/config/french_24l.yaml). Its larger size does not prove better quality or real-time performance on this machine. It was not present in the inspected local cache, so no additional model was loaded or downloaded. Its RAM use, latency and subjective quality remain unmeasured.

## Next step

Refresh the updated demo and observe the diagnostic while testing ordinary French and a task announcement. If gaps coincide with choppy speech, measure streamed arrival timing and competing CPU load. If speech is unclear without detected gaps, compare voices and model versions using a consented listening set under guarded memory measurements. The diagnostic does not alter interruption or resource admission.
