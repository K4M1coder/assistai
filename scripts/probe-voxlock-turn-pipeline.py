"""Replay synthetic audio through 20 ms extraction, native turn detection and local ASR."""
import asyncio
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
from voxlock import VoxLock


def load_script(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


probe = load_script('voxlock_probe', 'probe-voxlock.py')
turns = load_script('vad_probe', 'probe-vad-asr-comparison.py')


async def main():
    target, target_hash = probe.audio('tse-target.wav')
    other, other_hash = probe.audio('tse-interferer.wav')
    enrollment, enrollment_hash = probe.audio('tse-enroll.wav')
    length = max(len(target), len(other))
    target = np.pad(target, (0, length - len(target)))
    other = np.pad(other, (0, length - len(other)))
    other *= np.sqrt(np.mean(target ** 2) / max(np.mean(other ** 2), 1e-12))
    scale = min(1, 0.99 / np.max(np.abs(target + other)))
    # Leading and trailing silence permit turn detection to start and close naturally.
    mixture = np.concatenate([np.zeros(16000), (target + other) * scale, np.zeros(16000)]).astype(np.float32)
    model = VoxLock(model_dir=probe.CACHE / 'voxlock/onnx/v2', precision='int8', threads=2)
    stream = model.stream(enrollment)
    before = time.perf_counter()
    extracted = [stream.push(mixture[i:i + 320]) for i in range(0, len(mixture), 320)]
    extracted.append(stream.flush())
    filtered = np.concatenate(extracted)[:len(mixture)]
    elapsed = time.perf_counter() - before
    results = []
    for label, signal in [('mixture', mixture), ('filtered', filtered)]:
        for detector in ('energy', 'silero'):
            captured, starts, ends = turns.detect(signal, detector == 'silero')
            transcripts = [await turns.recognize(item) for item in captured if item]
            results.append({'condition': label, 'detector': detector, 'starts_ms': starts,
                            'ends_ms': ends, 'turn_count': len(captured), 'transcripts': transcripts})
    print(json.dumps({'fixture_sha256': {'target': target_hash, 'other': other_hash,
                                         'enrollment': enrollment_hash},
                      'input_samples': len(mixture), 'output_samples': len(filtered),
                      'audio_ms': round(len(mixture) / 16), 'stream_wall_ms': round(elapsed * 1000),
                      'results': results, 'note': 'Burst replay with synthetic voices; event times are output-sample positions, not live latency.'},
                     ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
