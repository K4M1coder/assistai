"""Compare AEC3 delay hints on a deterministic, synthetic fixed echo path."""
import json
from pathlib import Path
import time
import wave

import numpy as np
from pywebrtc_audio import AudioProcessor

with wave.open(str(Path('.cache/french-test.wav')), 'rb') as source:
    if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != 24000:
        raise ValueError('Expected 24 kHz mono PCM16 fixture')
    samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768
rate = 48000
total = rate * 12
indexes = np.arange(total)
render = samples[(indexes // 2) % len(samples)]
near = np.where(indexes > 8 * rate, 0.35 * samples[(indexes // 2 + len(samples) // 3) % len(samples)], 0).astype(np.float32)
capture = near.copy()
capture[2400:] += 0.4 * render[:-2400]
results = []
for delay in (0, 50):
    aec = AudioProcessor(sample_rate=rate, echo_cancellation=True, stream_delay_ms=delay)
    cleaned = np.empty(total, dtype=np.float32)
    start = time.perf_counter()
    for offset in range(0, total, 480):
        cleaned[offset:offset + 480] = aec.process(capture[offset:offset + 480], render[offset:offset + 480])
    elapsed = (time.perf_counter() - start) * 1000
    echo = slice(4 * rate, 8 * rate)
    double = slice(9 * rate, 12 * rate)
    ratio = lambda x, y: float(10 * np.log10(np.sum(x.astype(np.float64) ** 2) / np.sum(y.astype(np.float64) ** 2)))
    results.append({'delay_hint_ms': delay, 'wall_ms': round(elapsed, 2), 'echo_only_reduction_db': round(ratio(capture[echo], cleaned[echo]), 2), 'double_talk_output_to_near_db': round(ratio(cleaned[double], near[double]), 2)})
print(json.dumps({'seconds': 12, 'results': results, 'note': 'Synthetic fixed-delay path; output energy is not intelligibility.'}))
