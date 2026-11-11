"""Compare enrollment and thread count on synthetic audio; never opens a microphone."""
import asyncio
import importlib.util
import json
import time
from pathlib import Path

import numpy as np
from voxlock import VoxLock

probe_path = Path(__file__).with_name('probe-voxlock.py')
spec = importlib.util.spec_from_file_location('voxlock_probe', probe_path)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


async def main():
    names = {'target': 'tse-target.wav', 'other': 'tse-interferer.wav',
             'target_enrollment': 'tse-enroll.wav', 'other_enrollment': 'tse-other-enroll.wav'}
    loaded = {key: probe.audio(value) for key, value in names.items()}
    target, other = loaded['target'][0], loaded['other'][0]
    length = max(len(target), len(other))
    target = np.pad(target, (0, length - len(target)))
    other = np.pad(other, (0, length - len(other)))
    other *= np.sqrt(np.mean(target ** 2) / max(np.mean(other ** 2), 1e-12))
    scale = min(1, 0.99 / np.max(np.abs(target + other)))
    mixture = (target + other) * scale
    transcripts = {}
    for label, signal in [('target', target * scale), ('other', other * scale), ('mixture', mixture)]:
        transcripts[label] = await probe.recognize(signal)
    outputs, timings = {}, {}
    for threads, enrollment in [(1, 'target_enrollment'), (2, 'target_enrollment'), (2, 'other_enrollment')]:
        label = f'{threads}_threads_{enrollment}'
        model = VoxLock(model_dir=probe.CACHE / 'voxlock/onnx/v2', precision='int8', threads=threads)
        stream = model.stream(loaded[enrollment][0])
        start = time.perf_counter()
        chunks = [stream.push(mixture[i:i + 640]) for i in range(0, len(mixture), 640)]
        chunks.append(stream.flush())
        outputs[label] = np.concatenate(chunks)[:length]
        timings[label] = round(time.perf_counter() - start, 3)
        transcripts[label] = await probe.recognize(outputs[label])
    delta = outputs['1_threads_target_enrollment'] - outputs['2_threads_target_enrollment']
    print(json.dumps({'duration_ms': round(length / 16),
                      'fixture_sha256': {key: value[1] for key, value in loaded.items()},
                      'transcripts': transcripts, 'stream_wall_seconds': timings,
                      'same_enrollment_max_abs_delta': float(np.max(np.abs(delta))),
                      'same_enrollment_rms_delta': float(np.sqrt(np.mean(delta ** 2))),
                      'note': 'Synthetic offline signals; ASR is an imperfect proxy, not a separation metric.'}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
