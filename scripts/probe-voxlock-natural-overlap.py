"""Offline two-speaker diagnostic with disjoint enrollment and mixture segments."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
from voxlock import VoxLock

ROOT = Path(__file__).resolve().parents[1]
def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    item = importlib.util.module_from_spec(spec); spec.loader.exec_module(item)
    return item
probe = module('voxlock_probe', 'probe-voxlock.py')
metrics = module('correlation_probe', 'probe-browser-mixture-extraction.py')


async def main():
    target, target_hash = probe.audio('fleurs-fr-17559822372056259463.wav')
    other, other_hash = probe.audio('fleurs-fr-118005971910520590.wav')
    if target_hash != 'ca0c712cd2098656ae5c35b5e515f8682356f44983814a2e1cf2d16beb1775cc' or other_hash != '12e953bde5e4c50ef4280bbd94be79a810788c0494069389035bf928731eb5f7':
        raise ValueError('Unexpected source hash')
    split = 48000
    target_enrollment, other_enrollment = target[:split] * 8, other[:split] * 64
    target = target[split:] * 8
    other = other[split:split + len(target)] * 64
    if len(target) != len(other) or max(np.max(np.abs(target_enrollment)), np.max(np.abs(other_enrollment))) >= 1:
        raise ValueError('Invalid enrollment or source')
    mixture = target + other
    if np.max(np.abs(mixture)) >= 1:
        raise ValueError('Mixture would clip')
    model = VoxLock(model_dir=ROOT / '.cache/voxlock/onnx/v2', precision='int8', threads=2)
    references = {'target': target, 'other': other}
    results = {}
    for label, enrollment in [('target', target_enrollment), ('other', other_enrollment)]:
        stream = model.stream(enrollment)
        started = time.perf_counter()
        chunks = [stream.push(mixture[i:i + 320]) for i in range(0, len(mixture), 320)]
        chunks.append(stream.flush())
        result = np.concatenate(chunks)[:len(mixture)]
        results[label] = {'processing_seconds': round(time.perf_counter()-started, 3),
                          'transcript': await probe.recognize(result),
                          'source_correlations': {key: metrics.peak_correlation(result, value) for key, value in references.items()}}
    print(json.dumps({'source_hashes': {'target': target_hash, 'other': other_hash}, 'split_samples': split,
                      'mixture_samples': len(mixture), 'mixture_sha256': hashlib.sha256(mixture.astype('<f4').tobytes()).hexdigest(),
                      'input_correlations': {key: metrics.peak_correlation(mixture, value) for key, value in references.items()},
                      'clean_target_transcript': await probe.recognize(target), 'mixture_transcript': await probe.recognize(mixture),
                      'results': results, 'physical_devices_opened': False}, ensure_ascii=False), flush=True)


asyncio.run(main())
