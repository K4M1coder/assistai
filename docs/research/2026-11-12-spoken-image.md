# EXP-143: Synthetic spoken question about an image

## Hypothesis and protocol

The cascade should pair a French speech transcript with a selected image, route both to the vision model and produce a spoken answer. `scripts/run-spoken-image-probe.ps1` samples whole-adapter dedicated and shared GPU memory and available system RAM, checks a provisional 8 GiB preflight, and stops its own probe below 6 GiB RAM or above 22 GiB dedicated or 256 MiB absolute shared usage. Sampling does not enforce a hard limit. The probe uses the already running port 18091 gateway in a separate session, local Pocket TTS to synthesize a fixed French question, and a generated solid-red 64-by-64 PNG. It opens no physical audio device and writes no image or audio file.

## Observation

The real local Vosk sidecar produced `[Image] quelle est la couleur dominante de cette image répond en un mot`. The local vision path returned `Rouge`, and the gateway emitted 55,680 audio bytes. The measured 5,656 ms elapsed time starts after synthetic question generation and includes paced input transmission and response; it is not first-audio latency. Eight samples recorded minimum available RAM 9,791,881,216 bytes, maximum dedicated GPU 16,128,675,840 bytes and maximum shared GPU 264,257,536 bytes. Shared use was close to the conservative limit, and these whole-system snapshots cannot prove residency or absence of paging.

Seven targeted JavaScript tests passed. An optional PNG inspection initially failed because Pillow was not installed; a standard-library decompression check then confirmed the generated 64-by-64 red pixel data without installing a dependency.

## Interpretation

One simple synthetic case verifies wiring through the real services, not physical microphone use, browser file selection, audible speech, visual reasoning generally, or simultaneous coding. Compare diverse consented images and real speech when resource headroom permits; keep the native speech mode's lack of image input visible.

## Second synthetic color and current demo — 2026-11-17

The probe now accepts a selected gateway port and either a red or blue generated 64-by-64 PNG; `python -m unittest prototype.test_spoken_image_probe` independently decompresses the PNG pixel data for both colors. On the Windows B60, `scripts/run-spoken-image-probe.ps1 -GatewayPort 18111 -Color blue` used the existing cascade gateway, Pocket TTS, Vosk and vision model. It generated a French question and a blue image without saving either or opening physical devices. The transcript was `[Image] quelle est la couleur dominante de cette image répond en un mot`, the visual answer was `Bleu`, and the gateway returned 59,520 bytes of audio in 5,812 ms after question synthesis. No tool call or agent task was executed. The audio was not listened to.

Eight whole-system samples showed peak dedicated GPU use of 12,151,853,056 bytes, peak shared GPU use of 236,044,288 bytes, and minimum available RAM of 13,096,349,696 bytes. Sampling cannot rule out transient allocations or paging, and the shared reading was close to the conservative 256 MiB stop signal. This was the already running gateway rather than the latest source, and it does not verify the recent TTS timeout. The result extends the previous red synthetic case to a second simple image; it is not evidence of general visual understanding, physical camera or microphone use, audible quality, concurrent agent work or native speech-to-speech.
