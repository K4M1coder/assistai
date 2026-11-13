"""Offline comparison of two synthetic enrollments on the browser mixture."""
import asyncio
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
from scipy.signal import correlate, correlation_lags
from voxlock import VoxLock

source = Path(__file__).with_name('probe-voxlock.py')
spec = importlib.util.spec_from_file_location('voxlock_probe', source)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def peak_correlation(output, reference):
    """Largest normalized correlation within 200 ms, not a separation score."""
    denom = np.linalg.norm(output) * np.linalg.norm(reference)
    if denom == 0:
        return {'coefficient': 0.0, 'lag_ms': 0.0}
    correlation = correlate(output, reference, mode='full', method='fft')
    lags = correlation_lags(len(output), len(reference), mode='full')
    indices = np.flatnonzero(np.abs(lags) <= 3200)
    best = indices[np.argmax(np.abs(correlation[indices]))]
    return {'coefficient': round(float(correlation[best] / denom), 4), 'lag_ms': round(float(lags[best] / 16), 2)}


async def main():
    mixture, mixture_hash = probe.audio('assistant/browser-noisy-test.wav')
    target, _ = probe.audio('omni-french/utterance.wav')
    other, _ = probe.audio('omni-english/utterance.wav')
    other = np.resize(other, len(target)) * 0.35
    references = {'target': np.pad(target, (32000, 48000)), 'other': np.pad(other, (32000, 48000))}
    if any(len(reference) != len(mixture) for reference in references.values()):
        raise ValueError('Fixture length does not match its source construction')
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
                         'output_samples': len(output),
                         'source_correlations': {key: peak_correlation(output, value) for key, value in references.items()}}
    print(json.dumps({'mixture_sha256': mixture_hash,
                      'enrollment_sha256': {name: entry[1] for name, entry in enrollments.items()},
                      'input_samples': len(mixture), 'mixture_correlations': {key: peak_correlation(mixture, value) for key, value in references.items()}, 'results': results,
                      'note': 'Offline synthetic replay; ASR is not a separation metric.'}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
