# EXP-140: Streaming delivery and browser scheduling

## Hypothesis

Choppy speech could result from insufficient TTS delivery speed or browser scheduling. The browser's previous scheduler applied a 40 ms lead to every incoming chunk. If audio was still queued but less than 40 ms remained, this inserted a pause even without an underrun.

## Experiment and change

The client now schedules subsequent chunks exactly at the queued end while the queue has not run out, retaining the 40 ms lead at stream start and after an underrun. A mock audio-clock test reproduces 5 ms of remaining queued audio and confirms the next chunk starts at the previous end rather than 35 ms later. Three client-mode tests passed. This corrects an identified scheduling mechanism but has not yet been verified through a physical speaker or a real browser listening test.

`scripts/run-tts-pacing.ps1` ran three fixed synthetic French phrases against the already running French Pocket TTS, with a provisional 8 GiB available-RAM preflight, a 6 GiB stop threshold, a 22 GiB dedicated threshold and a conservative absolute 256 MiB shared threshold. The updated virtual scheduler saw no delivery gaps over 30 ms in these three sequential requests. First audio arrived in 179, 235 and 233 ms; complete request times were 1,273, 2,769 and 3,097 ms for generated audio durations of 2,680, 6,040 and 6,840 ms. Six resource samples showed minimum available RAM 9,902,841,856 bytes, maximum dedicated 16,120,877,056 bytes and maximum shared 267,415,552 bytes. Shared usage came within about 1 MiB of the conservative stop threshold. These are whole-machine snapshots; they do not establish a hard limit or absence of paging.

No audio was saved or played, and this test excludes browser and physical-device scheduling, simultaneous new agent tasks, diverse text and subjective intelligibility. A previous three-phrase run using the old virtual scheduling formula also showed zero measured starvation; its formula could mask gaps by inserting lead. The updated run above is the relevant estimate for the corrected scheduler.

## Next step

Refresh the local demo and compare actual French speech, reporting any gap diagnostic. If articulation is still poor without reported delivery gaps, assess alternative French voices or models through a guarded listening comparison rather than inferring quality from timing.
