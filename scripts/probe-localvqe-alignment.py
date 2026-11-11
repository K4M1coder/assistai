"""Test known reference offsets against synthetic echo; opens no audio devices."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from scipy.signal import correlate, correlation_lags
from prototype.reference_delay import estimate_delay

spec = importlib.util.spec_from_file_location('delay_probe', Path(__file__).with_name('probe-localvqe-delays.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
aec, audio, turns = probe.aec, probe.audio, probe.turns


async def main():
    if hashlib.sha256(aec.MODEL.read_bytes()).hexdigest() != aec.EXPECTED:
        raise RuntimeError('Unexpected model digest')
    near_voice, near_hash = audio.audio('tse-target.wav')
    far_voice, far_hash = audio.audio('tse-interferer.wav')
    count = (15 * aec.RATE // aec.HOP) * aec.HOP
    far = np.resize(far_voice, count).astype(np.float32)
    near = np.zeros(count, np.float32)
    begin = 5 * aec.RATE
    near[begin:begin + len(near_voice)] = 0.5 * near_voice
    echo = np.zeros(count, np.float32)
    for offset_ms, gain in ((0, .25), (23, .12), (71, .06)):
        shift = (700 + offset_ms) * aec.RATE // 1000
        echo[shift:] += far[:-shift] * gain
    calibration = estimate_delay(far[:4 * aec.RATE], echo[:4 * aec.RATE])
    lib = aec.library()
    results = []
    for shift_ms in (0, 400, 500, 700, 800):
        reference = np.zeros_like(far)
        shift = shift_ms * aec.RATE // 1000
        if shift: reference[shift:] = far[:-shift]
        else: reference[:] = far
        echo_out, _ = aec.run(lib, echo, reference)
        mixed_out, times = aec.run(lib, np.clip(echo + near, -1, 1), reference)
        _, false_starts, _ = turns.detect(echo_out, False)
        _, starts, _ = turns.detect(mixed_out, False)
        segment = slice(begin, begin + len(near_voice))
        actual, expected = mixed_out[segment], near[segment]
        scores = correlate(actual, expected, method='fft')
        lags = correlation_lags(len(actual), len(expected))
        results.append({'reference_shift_ms': shift_ms, 'echo_only_turn_starts_ms': false_starts,
                        'overlap_turn_starts_ms': starts,
                        'overlap_transcript': await audio.recognize(actual),
                        'near_correlation': round(float(scores[np.abs(lags) < aec.RATE // 10].max() / (np.linalg.norm(actual) * np.linalg.norm(expected) + 1e-12)), 3),
                        'hop_p95_ms': round(float(np.percentile(times, 95)), 3)})
    print(json.dumps({'near_sha256': near_hash, 'far_sha256': far_hash, 'echo_delay_ms': 700, 'calibration': calibration,
                      'near_start_ms': 5000, 'cases': results,
                      'note': 'Offsets are manually supplied synthetic ground truth, not a delay estimator or real-device measurement.'}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
