"""Offline synthetic-speaker experiment; reads WAV files and never captures a microphone."""
import asyncio
import hashlib
import json
import os
import time
import wave
from math import gcd
from pathlib import Path

import numpy as np
from scipy.signal import resample_poly
from websockets.asyncio.client import connect
from voxlock import VoxLock

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"


def audio(name):
    path = CACHE / name
    with wave.open(str(path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("Expected mono PCM16")
        rate = wav.getframerate()
        signal = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768
    divisor = gcd(rate, 16000)
    return resample_poly(signal, 16000 // divisor, rate // divisor), hashlib.sha256(path.read_bytes()).hexdigest()


async def recognize(samples):
    async with connect("ws://127.0.0.1:18082/asr") as socket:
        assert json.loads(await socket.recv())["type"] == "ready"
        pcm = (np.clip(samples, -1, 0.999969) * 32768).astype("<i2")
        for offset in range(0, len(pcm), 1600):
            await socket.send(pcm[offset:offset + 1600].tobytes())
        await socket.send('{"type":"end"}')
        pieces = []
        while True:
            event = json.loads(await socket.recv())
            if event["type"] in ("segment", "final") and event.get("text"):
                pieces.append(event["text"])
            if event["type"] == "final":
                return " ".join(pieces)


async def main():
    target, target_hash = audio("tse-target.wav")
    other, other_hash = audio("tse-interferer.wav")
    enroll, enroll_hash = audio("tse-enroll.wav")
    length = max(len(target), len(other))
    target = np.pad(target, (0, length - len(target)))
    other = np.pad(other, (0, length - len(other)))
    other *= np.sqrt(np.mean(target ** 2) / max(np.mean(other ** 2), 1e-12))
    mixture = target + other  # 0 dB whole-clip SNR
    scale = min(1, 0.99 / np.max(np.abs(mixture)))
    mixture *= scale
    model_dir = CACHE / "voxlock/onnx/v2"
    before = time.perf_counter()
    model = VoxLock(model_dir=model_dir, precision="int8", threads=1)
    load_ms = round((time.perf_counter() - before) * 1000)
    stream = model.stream(enroll)
    before = time.perf_counter()
    cpu_before = time.process_time()
    chunks = [stream.push(mixture[i:i + 640]) for i in range(0, len(mixture), 640)]
    chunks.append(stream.flush())
    output = np.concatenate(chunks)[:len(mixture)]
    wall = time.perf_counter() - before
    cpu = time.process_time() - cpu_before
    result = {"duration_ms": round(length / 16), "model_load_ms": load_ms, "stream_wall_ms": round(wall * 1000), "stream_cpu_ms": round(cpu * 1000), "rtf": round(wall / (length / 16000), 3), "source_sha256": {"target": target_hash, "interferer": other_hash, "enrollment": enroll_hash}, "transcripts": {}}
    for label, signal in (("target", target * scale), ("mixture", mixture), ("isolated", output)):
        result["transcripts"][label] = await recognize(signal)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    asyncio.run(main())
