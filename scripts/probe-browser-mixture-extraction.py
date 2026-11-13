"""Offline comparison of two synthetic enrollments on the browser mixture."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
from voxlock import VoxLock

source = Path(__file__).with_name('probe-voxlock.py')
spec = importlib.util.spec_from_file_location('voxlock_probe', source)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


async def main():
    mixture, mixture_hash = probe.audio('assistant/browser-noisy-test.wav')
    enrollments = {name: probe.audio(file) for name, file in (
        ('target', 'tse-enroll.wav'), ('other', 'tse-zira-enroll.wav'))}
    model = VoxLock(model_dir=probe.CACHE / 'voxlock/onnx/v2', precision='int8', threads=2)
    results = {}
    for name, (enrollment, _) in enrollments.items():
        stream = model.stream(enrollment)
        start = time.perf_counter()
        chunks = [stream.push(mixture[offset:offset + 320]) for offset in range(0, len(mixture), 320)]
        chunks.append(stream.flush())
        output = np.concatenate(chunks)[:len(mixture)]
        elapsed = time.perf_counter() - start
        results[name] = {'transcript': await probe.recognize(output), 'processing_seconds': round(elapsed, 3),
                         'output_samples': len(output)}
    print(json.dumps({'mixture_sha256': mixture_hash,
                      'enrollment_sha256': {name: entry[1] for name, entry in enrollments.items()},
                      'input_samples': len(mixture), 'results': results,
                      'note': 'Offline synthetic replay; ASR is not a separation metric.'}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
