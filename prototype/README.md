# Experimental local voice components

These components are an early implementation, not the complete assistant. The existing web UI remains a demo and is not connected to this sidecar yet.

## French speech recognition

Create a Python 3.11 or 3.12 environment, install the pinned direct dependencies in `requirements.txt`, then run `python scripts/setup-vosk-fr.py` from the repository root. This downloads the public Vosk French small model into `.cache/vosk`. After setup, the recognizer runs locally without network access. Set `ASSISTAI_VOSK_MODEL` to use a different Vosk model directory.

From the repository root, start `python -m uvicorn prototype.asr_server:app --host 127.0.0.1 --port 18082`. `GET /health` reports readiness. The `/asr` WebSocket accepts binary mono 16 kHz little-endian PCM16 frames of at most one second. It emits JSON `partial` and `segment` events while audio arrives. Send `{"type":"end"}` to receive a `final` event and reset the recognizer, or `{"type":"reset"}` to discard the current utterance. Clients must collect `segment` events as well as the final text for longer utterances.

`python scripts/test-asr-sidecar.py path/to/mono.wav` resamples a 16-bit mono WAV and replays it at real-time speed. With no argument, it expects `.cache/french-test.wav`, produced by the Pocket TTS experiment. This is an integration probe, not a benchmark of real microphones, accents, noise, or word error rate.

## Limitations

There is no connected microphone client, agent orchestration, spoken response, authentication, or concurrency/resource policy yet. Bind the sidecar to loopback and avoid exposing it to the network. Vosk's small French model is a baseline, not the final model choice; compare it against Kyutai STT and other candidates with an authorized corpus.
