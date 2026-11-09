"""Replay a local WAV at real-time speed against the streaming ASR sidecar."""
import asyncio
import json
from pathlib import Path
import sys
import time
import wave

import numpy as np
from scipy.signal import resample_poly
from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parents[1]
AUDIO = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".cache/french-test.wav"


async def main() -> None:
    with wave.open(str(AUDIO), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("Expected a mono 16-bit PCM WAV")
        rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")
    from math import gcd
    divisor = gcd(rate, 16000)
    samples = np.clip(resample_poly(samples.astype(np.float32), 16000 // divisor, rate // divisor), -32768, 32767).astype("<i2")
    async with connect("ws://127.0.0.1:18082/asr", max_size=1024 * 1024) as ws:
        ready = json.loads(await ws.recv())
        assert ready["type"] == "ready" and ready["sample_rate"] == 16000
        received = []
        start = time.perf_counter()

        async def receive():
            async for message in ws:
                event = json.loads(message)
                received.append({"elapsed_ms": round((time.perf_counter() - start) * 1000), **event})
                if event["type"] == "final":
                    return

        receiver = asyncio.create_task(receive())
        for offset in range(0, len(samples), 1600):
            await ws.send(samples[offset:offset + 1600].tobytes())
            await asyncio.sleep(0.1)
        await ws.send(json.dumps({"type": "end"}))
        await asyncio.wait_for(receiver, timeout=20)
        print(json.dumps({"audio_ms": round(len(samples) / 16), "events": received}, ensure_ascii=False))


asyncio.run(main())
