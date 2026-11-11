"""Compare CPU Silero VAD and an RMS gate on deterministic synthetic signals."""
import hashlib
import json
from pathlib import Path
import time
import wave

import numpy as np
import onnxruntime as ort
from scipy.signal import resample_poly
from math import gcd

model_path = Path('.cache/silero-vad-research/silero_vad/data/silero_vad.onnx')
expected = '1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3'
if hashlib.sha256(model_path.read_bytes()).hexdigest() != expected:
    raise RuntimeError('Unexpected VAD model digest')


def load_wav(path):
    with wave.open(str(path), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError('Expected mono PCM16 fixture')
        rate = source.getframerate()
        data = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768
    divisor = gcd(rate, 16000)
    return resample_poly(data, 16000 // divisor, rate // divisor).astype(np.float32)


target = load_wav('.cache/tse-target.wav')
other = load_wav('.cache/tse-interferer.wav')
length = len(target)
index = np.arange(length, dtype=np.float32) / 16000
random = np.random.default_rng(20261111)
cases = {
    'target_synthetic_speech':target,
    'other_synthetic_speech':np.pad(other, (0, max(0, length - len(other))))[:length],
    'seeded_white_noise':random.normal(0, 0.05, length).astype(np.float32),
    'harmonic_tones':(0.04 * (np.sin(2*np.pi*330*index) + 0.5*np.sin(2*np.pi*660*index))).astype(np.float32),
    'silence':np.zeros(length, dtype=np.float32),
}
options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1
start = time.perf_counter()
session = ort.InferenceSession(str(model_path), sess_options=options, providers=['CPUExecutionProvider'])
load_ms = (time.perf_counter() - start) * 1000
results = []
for name, audio in cases.items():
    audio = np.pad(audio, (0, (-len(audio)) % 512))
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    probabilities, rms, timings = [], [], []
    for offset in range(0, len(audio), 512):
        frame = audio[offset:offset + 512]
        sample = np.concatenate((context, frame.reshape(1, -1)), axis=1)
        started = time.perf_counter_ns()
        output, state = session.run(None, {'input':sample, 'state':state, 'sr':np.array(16000, dtype=np.int64)})
        timings.append((time.perf_counter_ns() - started) / 1e6)
        context = sample[:, -64:]
        probabilities.append(float(output[0, 0]))
        rms.append(float(np.sqrt(np.mean(frame * frame))))
    results.append({'case':name,'frames':len(probabilities),'vad_frames_at_05':sum(p >= 0.5 for p in probabilities),
                    'rms_frames_at_0025':sum(value > 0.025 for value in rms),
                    'vad_probability_max':round(max(probabilities), 4),
                    'inference_ms_p50':round(float(np.percentile(timings, 50)), 4),
                    'inference_ms_p95':round(float(np.percentile(timings, 95)), 4)})
print(json.dumps({'model_sha256':expected,'provider':session.get_providers(),'threads':1,'frame_ms':32,
                  'load_ms':round(load_ms, 2),'cases':results,
                  'note':'Synthetic examples without speech annotations; not WER, speaker identification, or an accuracy benchmark.'}))
