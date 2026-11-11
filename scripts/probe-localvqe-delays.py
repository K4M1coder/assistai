"""Compare synthetic echo paths and two synthetic voices; no audio devices are used."""
import asyncio
import importlib.util
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.signal import correlate, correlation_lags


def load_script(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


aec = load_script('aec_probe', 'probe-localvqe-synthetic.py')
audio = load_script('voice_probe', 'probe-voxlock.py')
turns = load_script('turn_probe', 'probe-vad-asr-comparison.py')


async def main():
    if hashlib.sha256(aec.MODEL.read_bytes()).hexdigest() != aec.EXPECTED:
        raise RuntimeError('Unexpected model digest')
    near_voice, near_hash = audio.audio('tse-target.wav')
    far_voice, far_hash = audio.audio('tse-interferer.wav')
    total = (15 * aec.RATE // aec.HOP) * aec.HOP
    far = np.resize(far_voice, total).astype(np.float32)
    near = np.zeros(total, np.float32)
    begin = 5 * aec.RATE
    near[begin:begin + len(near_voice)] = 0.5 * near_voice
    lib = aec.library()
    cases = []
    for delay_ms in (40, 150, 350, 700):
        echo = np.zeros(total, np.float32)
        for offset_ms, gain in ((0, .25), (23, .12), (71, .06)):
            shift = (delay_ms + offset_ms) * aec.RATE // 1000
            echo[shift:] += far[:-shift] * gain
        echo_out, echo_times = aec.run(lib, echo, far)
        overlap = echo + near
        clipped = int(np.count_nonzero(np.abs(overlap) > 1))
        overlap_out, overlap_times = aec.run(lib, np.clip(overlap, -1, 1), far)
        segment = slice(begin, begin + len(near_voice))
        actual, expected = overlap_out[segment], near[segment]
        scores = correlate(actual, expected, method='fft')
        lags = correlation_lags(len(actual), len(expected))
        end = slice(12 * aec.RATE, total)
        _, echo_starts, _ = turns.detect(echo_out, False)
        _, overlap_starts, _ = turns.detect(overlap_out, False)
        cases.append({'delay_ms': delay_ms, 'echo_reduction_db': round(float(10 * np.log10(np.mean(echo[end] ** 2) / (np.mean(echo_out[end] ** 2) + 1e-12))), 2),
                      'near_correlation': round(float(scores[np.abs(lags) < aec.RATE // 10].max() / (np.linalg.norm(actual) * np.linalg.norm(expected) + 1e-12)), 3),
                      'near_norm_ratio': round(float(np.linalg.norm(actual) / (np.linalg.norm(expected) + 1e-12)), 3),
                      'overlap_transcript': await audio.recognize(actual), 'clipped_samples': clipped,
                      'echo_only_turn_starts_ms': echo_starts, 'overlap_turn_starts_ms': overlap_starts,
                      'hop_p95_ms': round(float(np.percentile(echo_times + overlap_times, 95)), 3)})
    print(json.dumps({'near_sha256': near_hash, 'far_sha256': far_hash,
                      'clean_near_transcript': await audio.recognize(0.5 * near_voice),
                      'echo_taps_ms_and_gain': [[0, .25], [23, .12], [71, .06]],
                      'model_sha256': aec.EXPECTED, 'cases': cases,
                      'note': 'Synthetic stationary multipath and synthetic voices; not a real-room or live interruption test.'}, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
