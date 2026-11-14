"""Replay synthetic AEC output through the browser's RMS onset rule."""
import argparse
import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

INPUT_RATE = 48000
RATE = 16000
FRAME = 320  # 20 ms; resampling approximates the browser capture path


def onset_times(samples, threshold, start, end):
    """Report transitions to three consecutive above-threshold frames."""
    selected = samples[int(start * RATE):int(end * RATE)]
    selected = selected[:len(selected) // FRAME * FRAME].reshape(-1, FRAME)
    rms = np.sqrt(np.mean(selected * selected, axis=1))
    streak = 0
    events = []
    for index, value in enumerate(rms):
        streak = streak + 1 if value > threshold else 0
        if streak == 3:
            events.append(round(start + (index + 1) * 0.02, 3))
    return events


def load_wav(path):
    rate, samples = wavfile.read(path)
    if rate != INPUT_RATE or samples.ndim != 1 or samples.dtype not in (np.int16, np.float32):
        raise ValueError('Expected mono 48 kHz PCM16 or float32 WAV')
    result = samples.astype(np.float32) / (32768 if samples.dtype == np.int16 else 1)
    if not np.isfinite(result).all():
        raise ValueError('Invalid audio values')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, help='Synthetic fixture produced by probe-echoless-offline.py')
    directory = parser.parse_args().directory
    outputs = {'raw': load_wav(directory / 'mic.wav'), 'echoless': load_wav(directory / 'out.wav'),
               'browser': np.fromfile(directory / 'browser.f32', dtype='<f4')}
    if any(len(audio) != 12 * INPUT_RATE or not np.isfinite(audio).all() for audio in outputs.values()):
        raise ValueError('Expected finite, aligned 12-second fixture outputs')
    results = {}
    for label, audio in outputs.items():
        audio = resample_poly(audio, 1, 3)
        results[label] = {}
        for threshold in (0.025, 0.105):
            echo = onset_times(audio, threshold, 3, 6)
            overlap = onset_times(audio, threshold, 7, 11)
            results[label][str(threshold)] = {'echo_only_onsets': len(echo), 'first_echo_onset_s': echo[0] if echo else None,
                                               'overlap_onsets': len(overlap), 'first_overlap_onset_s': overlap[0] if overlap else None}
    print(json.dumps({'results': results, 'note': 'Synthetic RMS detector replay with approximate 16 kHz resampling; not a live interruption or intelligibility test.'}))


if __name__ == '__main__':
    main()
