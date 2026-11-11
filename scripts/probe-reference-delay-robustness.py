"""Evaluate delay estimation on deterministic synthetic signals; no audio devices."""
import importlib.util
import json
from pathlib import Path

import numpy as np
from prototype.reference_delay import estimate_delay

spec = importlib.util.spec_from_file_location('voice_probe', Path(__file__).with_name('probe-voxlock.py'))
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


def shifted(signal, samples):
    result = np.zeros_like(signal)
    result[samples:] = signal[:-samples]
    return result


def scaled_rms(signal, target):
    return signal * (target / max(float(np.sqrt(np.mean(signal * signal))), 1e-12))


def main():
    ref_voice, ref_hash = audio.audio('tse-interferer.wav')
    near_voice, near_hash = audio.audio('tse-target.wav')
    rate, count = 16000, 6 * 16000
    reference = np.resize(ref_voice, count)
    near = np.resize(near_voice, count)
    rng = np.random.default_rng(20261111)
    noise = rng.normal(0, 1, count)
    positions = np.arange(count)
    drifted = np.interp(positions * 1.001, positions, reference, left=0, right=0)
    cases = []
    for delay_ms in (40, 150, 350, 700):
        echo = .25 * shifted(reference, delay_ms * rate // 1000)
        echo_rms = float(np.sqrt(np.mean(echo * echo)))
        scenarios = {
            'echo_only': echo,
            'near_voice_equal_rms': echo + scaled_rms(near, echo_rms),
            'near_voice_10x_power': echo + scaled_rms(near, echo_rms * np.sqrt(10)),
            'noise_equal_rms': echo + scaled_rms(noise, echo_rms),
            'noise_10x_power': echo + scaled_rms(noise, echo_rms * np.sqrt(10)),
            'near_voice_without_echo': scaled_rms(near, echo_rms),
            'clock_rate_offset_1000ppm': .25 * shifted(drifted, delay_ms * rate // 1000),
            'stronger_correlated_path_200ms': echo + .5 * shifted(reference, 200 * rate // 1000),
        }
        for condition, microphone in scenarios.items():
            result = estimate_delay(reference, microphone)
            estimated = result['delay_samples']
            cases.append({'delay_ms': delay_ms, 'condition': condition,
                          'accepted': result['accepted'],
                          'estimated_ms': round(estimated * 1000 / rate, 2) if estimated is not None else None,
                          'correlation': round(result['correlation'], 3),
                          'peak_ratio': round(result['peak_ratio'], 3)})
    print(json.dumps({'reference_sha256': ref_hash, 'near_sha256': near_hash,
                      'model': 'normalized cross-correlation', 'seconds': 6, 'seed': 20261111,
                      'cases': cases, 'note': 'Deterministic synthetic voices and noise, not real device calibration.'}))


if __name__ == '__main__': main()
