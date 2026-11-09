"""Compare local ASR transcripts on a synthetic mixture; no microphone is used."""
import asyncio
import hashlib
import json
import time
import wave
from math import gcd
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly
from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".cache/french-test.wav"


async def transcribe(audio):
    async with connect("ws://127.0.0.1:18082/asr") as socket:
        assert json.loads(await socket.recv())["type"] == "ready"
        start = time.perf_counter()
        for chunk in np.array_split(audio, max(1, (len(audio) + 1599) // 1600)):
            await socket.send(chunk.astype("<i2").tobytes())
        await socket.send(json.dumps({"type": "end"}))
        segments = []
        while True:
            event = json.loads(await socket.recv())
            if event["type"] in ("segment", "final") and event.get("text"):
                segments.append(event["text"])
            if event["type"] == "final":
                return {"transcript": " ".join(segments), "processing_ms": round((time.perf_counter() - start) * 1000)}


async def main():
    with wave.open(str(SOURCE), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("Expected mono PCM16")
        rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32)
    divisor = gcd(rate, 16000)
    clean = resample_poly(samples, 16000 // divisor, rate // divisor)
    # Shifted same-voice speech is a controlled stressor, not a realistic second speaker.
    interference = np.roll(clean, len(clean) // 2)
    noise = np.random.default_rng(20261110).normal(size=len(clean)).astype(np.float32)
    reference_rms = np.sqrt(np.mean(clean ** 2))
    conditions = {"clean": clean}
    for label, signal in (("shifted_same_voice", interference), ("white_noise", noise)):
        normalized = signal / np.sqrt(np.mean(signal ** 2)) * reference_rms
        for snr in (10, 0):
            mixture = clean + normalized * 10 ** (-snr / 20)
            # Common scaling avoids clipping without altering the signal-to-noise ratio.
            mixture *= min(1.0, 32767 / max(1.0, np.max(np.abs(mixture))))
            conditions[f"{label}_{snr}db"] = mixture
    results = {}
    for label, signal in conditions.items():
        results[label] = await transcribe(np.clip(signal, -32768, 32767))
    print(json.dumps({"source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "audio_ms": round(len(clean) / 16), "conditions": results}, ensure_ascii=False))


asyncio.run(main())
