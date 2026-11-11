"""Probe a pinned external timestamp-aligned AEC on synthetic audio only."""
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import time
import wave

import numpy as np
from scipy.signal import correlate, correlation_lags, resample_poly

source = Path('.cache/hf-speech-research/src/speech_to_speech/api/openai_realtime/echo_canceller.py')
if not source.is_file():
    raise SystemExit('Clone the pinned source revision described in the research notebook first')
revision = subprocess.check_output(['git', '-C', '.cache/hf-speech-research', 'rev-parse', 'HEAD'], text=True).strip()
if revision != 'ebc09bf286edbe8739a59575709070f056d31e29':
    raise SystemExit('Unexpected comparator source revision')
if hashlib.sha256(Path('.cache/french-test.wav').read_bytes()).hexdigest() != 'de7a02ac447c49526f3ee76336ab6268ee7af389881150042fbe75fe86a612c7':
    raise SystemExit('Unexpected synthetic speech fixture')
spec = importlib.util.spec_from_file_location('research_echo_canceller', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with wave.open('.cache/french-test.wav', 'rb') as wav:
    if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 24000:
        raise ValueError('Expected 24 kHz mono PCM16 fixture')
    speech = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32)

results = []
for rate in (16000, 24000):
    fragment = resample_poly(speech, 2, 3) if rate == 16000 else speech
    played = np.tile(fragment, int(np.ceil(12 * rate / len(fragment))))[:12 * rate].astype(np.int16)
    for block, device_delay_ms in ((1024, 256), (8192, 1000)):
        for mode in ('echo', 'overlap', 'near_only'):
            delay = rate * device_delay_ms // 1000 + rate // 50
            echo = np.zeros_like(played)
            if mode != 'near_only':
                echo[delay:] = (played[:-delay] * 0.3).astype(np.int16)
            near = np.zeros_like(played)
            if mode == 'overlap': near[6 * rate:8 * rate] = played[10 * rate:12 * rate]
            if mode == 'near_only': near = played.copy()
            microphone = np.clip(echo.astype(np.int32) + near.astype(np.int32), -32768, 32767).astype(np.int16)
            canceller = module.EchoCanceller(rate, rate)
            output = bytearray()
            start_time = time.perf_counter()
            for start in range(0, len(played), block):
                if mode != 'near_only':
                    jitter = 0.002 * (start // block % 2) if block == 1024 else 0
                    canceller.render(played[start:start + block].tobytes(), (start + delay - rate // 50) / rate + jitter)
                output.extend(canceller.capture(microphone[start:start + block].tobytes(), start / rate))
            elapsed = 1000 * (time.perf_counter() - start_time)
            cleaned = np.frombuffer(output, dtype=np.int16).astype(np.float64)
            if len(cleaned) != len(played) // (rate // 100) * (rate // 100): raise RuntimeError('Output sample count mismatch')
            result = {'rate':rate, 'block':block, 'device_delay_ms':device_delay_ms, 'mode':mode, 'wall_ms':round(elapsed, 2)}
            if mode == 'echo':
                tail = slice(8 * rate, len(cleaned))
                result['echo_reduction_db'] = round(float(10 * np.log10(np.mean(echo[tail].astype(float)**2) / (np.mean(cleaned[tail]**2) + 1e-9))), 2)
            else:
                actual, expected = cleaned[6 * rate:8 * rate], near[6 * rate:8 * rate].astype(float)
                scores = correlate(actual, expected, method='fft')
                lags = correlation_lags(len(actual), len(expected))
                result['near_correlation'] = round(float(scores[np.abs(lags) < rate // 100].max() / (np.linalg.norm(actual) * np.linalg.norm(expected))), 3)
                result['near_norm_ratio'] = round(float(np.linalg.norm(actual) / np.linalg.norm(expected)), 3)
            results.append(result)
print(json.dumps({'seconds_per_case':12, 'cases':results, 'note':'Synthetic signal and timestamps, not physical device measurements.'}))
