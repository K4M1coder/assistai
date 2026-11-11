"""Offline reference-delay research helper; not used as a live calibration."""
import numpy as np
from scipy.signal import correlate, correlation_lags


def estimate_delay(reference, microphone, *, sample_rate=16000, max_delay_ms=1000,
                   min_correlation=0.25, min_peak_ratio=1.15):
    """Return a guarded positive-lag estimate; callers must supply calibration audio.

    This does not distinguish echo from another correlated source or measure drift.
    """
    ref = np.asarray(reference, dtype=np.float64)
    mic = np.asarray(microphone, dtype=np.float64)
    if ref.ndim != 1 or mic.ndim != 1 or len(ref) != len(mic) or len(ref) < sample_rate:
        raise ValueError('Expected equal mono calibration signals of at least one second')
    if not np.isfinite(ref).all() or not np.isfinite(mic).all() or sample_rate <= 0 or not 0 < max_delay_ms <= 2000:
        raise ValueError('Invalid calibration input')
    max_lag = min(int(sample_rate * max_delay_ms / 1000), len(ref) - sample_rate // 2)
    if max_lag < 1: raise ValueError('Calibration window is too short')
    scores = correlate(mic, ref, mode='full', method='fft')
    lags = correlation_lags(len(mic), len(ref), mode='full')
    selected = (lags >= 0) & (lags <= max_lag)
    values = scores[selected]
    positions = lags[selected]
    ref_energy = np.concatenate(([0.0], np.cumsum(ref * ref)))
    mic_energy = np.concatenate(([0.0], np.cumsum(mic * mic)))
    denom = np.sqrt(ref_energy[len(ref) - positions] * (mic_energy[len(mic)] - mic_energy[positions]))
    normalized = np.divide(np.abs(values), denom, out=np.zeros_like(values), where=denom > 1e-9)
    peak_index = int(np.argmax(normalized))
    peak = float(normalized[peak_index])
    lag = int(positions[peak_index])
    alternatives = normalized[np.abs(positions - lag) > int(sample_rate * .02)]
    runner_up = float(np.max(alternatives)) if len(alternatives) else 0.0
    ratio = peak / max(runner_up, 1e-12)
    accepted = peak >= min_correlation and ratio >= min_peak_ratio
    return {'delay_samples': lag if accepted else None, 'correlation': peak,
            'runner_up_correlation': runner_up, 'peak_ratio': ratio, 'accepted': accepted}
