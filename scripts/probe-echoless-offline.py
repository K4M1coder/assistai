"""Compare two AEC3 engines on a synthetic echo path; never opens audio devices."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import wave

import numpy as np
from scipy.io import wavfile
from scipy.signal import correlate, correlation_lags, resample_poly

RATE = 48000
EXE = Path('.cache/echoless-v1.2.0/echoless.exe')
EXPECTED_HASH = 'e73713516ecc34edc0530bd2d089887fca5471dc403bab16696b17db77265a7b'


def source(path):
    with wave.open(str(path), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
            raise ValueError('Expected mono 16 kHz PCM16 source')
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768


def save(path, samples):
    with path.open('xb') as handle, wave.open(handle, 'wb') as wav:
        wav.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        wav.writeframes((np.clip(samples, -1, 32767 / 32768) * 32768).astype('<i2').tobytes())


def measure(mic, near, output):
    echo_only = slice(3 * RATE, 6 * RATE)
    reduction = 10 * np.log10(np.sum(mic[echo_only] ** 2) / max(np.sum(output[echo_only] ** 2), 1e-20))
    observed, expected = output[8 * RATE:11 * RATE], near[8 * RATE:11 * RATE]
    correlation = correlate(observed, expected, mode='full', method='fft')
    lags = correlation_lags(len(observed), len(expected), mode='full')
    indices = np.flatnonzero(np.abs(lags) <= 4800)
    best = indices[np.argmax(np.abs(correlation[indices]))]
    return {'echo_only_reduction_db': round(float(reduction), 2),
            'doubletalk_near_correlation': round(float(correlation[best] / (np.linalg.norm(observed) * np.linalg.norm(expected))), 4),
            'best_lag_ms': round(float(lags[best] / 48), 2),
            'output_to_near_rms': round(float(np.linalg.norm(observed) / np.linalg.norm(expected)), 4)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='New directory under .cache; files contain synthetic audio')
    args = parser.parse_args()
    cache = Path('.cache').resolve(strict=True)
    directory = args.output.resolve()
    if directory == cache or not directory.is_relative_to(cache):
        raise ValueError('Output directory must be inside .cache')
    if hashlib.sha256(EXE.read_bytes()).hexdigest() != EXPECTED_HASH:
        raise ValueError('Echoless executable hash mismatch')
    directory.mkdir(parents=False, exist_ok=False)
    length = RATE * 12
    reference = np.resize(resample_poly(source('.cache/omni-english/utterance.wav'), 3, 1), length)
    voice = np.resize(resample_poly(source('.cache/omni-french/utterance.wav'), 3, 1), length)
    delay = 7200
    near = np.zeros_like(reference); near[7 * RATE:] = voice[7 * RATE:] * 0.35
    microphone = np.pad(reference[:-delay], (delay, 0)) * 0.35 + near
    for name, samples in [('ref', reference), ('mic', microphone), ('near', near)]:
        save(directory / f'{name}.wav', samples)
    command = [str(EXE.resolve()), 'offline', '--mic', str(directory / 'mic.wav'), '--reference', str(directory / 'ref.wav'),
               '--out', str(directory / 'out.wav'), '--chain', 'aec3', '--rate', str(RATE), '--frame-ms', '10']
    echoless = subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
    browser = subprocess.run(['node', 'scripts/probe-browser-aec-fixture.mjs', str(directory)], check=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60)
    rate, output = wavfile.read(directory / 'out.wav')
    if rate != RATE or output.ndim != 1 or len(output) != length:
        raise ValueError('Unexpected Echoless output format')
    output = output.astype(np.float32) / (32768 if output.dtype == np.int16 else 1)
    browser_output = np.fromfile(directory / 'browser.f32', dtype='<f4')
    if len(browser_output) != length:
        raise ValueError('Unexpected browser output length')
    print(json.dumps({'echoless': measure(microphone, near, output), 'browser': measure(microphone, near, browser_output),
                      'echoless_output': echoless.stdout.strip(), 'browser_timing': json.loads(browser.stdout),
                      'note': 'Synthetic fixed echo; correlation and energy are not speech intelligibility.'}))


if __name__ == '__main__':
    main()
