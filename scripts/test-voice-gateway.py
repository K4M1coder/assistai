"""Replay the local French fixture through ASR, LLM, and streaming TTS."""
import asyncio
import json
from math import gcd
from pathlib import Path
import time
import wave

import numpy as np
from scipy.signal import resample_poly
from websockets.asyncio.client import connect

audio_path = Path(__file__).resolve().parents[1] / ".cache/french-test.wav"
with wave.open(str(audio_path), "rb") as wav:
    assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
    rate = wav.getframerate()
    samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")
factor = gcd(rate, 16000)
samples = np.clip(resample_poly(samples.astype(np.float32), 16000 // factor, rate // factor), -32768, 32767).astype("<i2")


async def main():
    start = time.perf_counter()
    events = []
    audio_bytes = 0
    async with connect("ws://127.0.0.1:18083/voice", max_size=1024 * 1024) as socket:
        async def read():
            nonlocal audio_bytes
            async for item in socket:
                if isinstance(item, bytes):
                    audio_bytes += len(item)
                    continue
                event = json.loads(item)
                events.append({"elapsed_ms": round((time.perf_counter() - start) * 1000), **event})
                if event["type"] == "error":
                    raise RuntimeError(event["message"])
                if event["type"] == "speech.end":
                    return

        # ASR model must be initialized before streaming audio.
        while True:
            item = json.loads(await asyncio.wait_for(socket.recv(), 30))
            events.append({"elapsed_ms": round((time.perf_counter() - start) * 1000), **item})
            if item["type"] == "error":
                raise RuntimeError(item["message"])
            if item["type"] == "asr.ready":
                break
        reader = asyncio.create_task(read())
        for i in range(0, len(samples), 1600):
            await socket.send(samples[i:i + 1600].tobytes())
            await asyncio.sleep(0.1)
        await socket.send(json.dumps({"type": "audio.end"}))
        await asyncio.wait_for(reader, 120)
    assert audio_bytes > 0, "No generated speech audio"
    print(json.dumps({"events": events, "output_audio_bytes": audio_bytes}, ensure_ascii=False))


asyncio.run(main())
