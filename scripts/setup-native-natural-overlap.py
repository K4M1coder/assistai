"""Create new, bounded 16 kHz research fixtures from pinned public recordings."""
import hashlib
from pathlib import Path
import wave

import numpy as np
import soundfile as sf
import soxr

root = Path(__file__).resolve().parents[1] / '.cache'
inputs = [('mls-sidon-natural/1406_1028_000000.flac', '8346625854eb7c3611febabf50747e1e315597c357390197740424f04c71c260'),
          ('mls-sidon-natural/1406_1028_000001.flac', 'e769454a1922457df8580baf95ca2bfd4b0ffeb526f1ac61fa43c5ab77170431'),
          ('fleurs-fr-118005971910520590.wav', '12e953bde5e4c50ef4280bbd94be79a810788c0494069389035bf928731eb5f7')]
audio = []
for name, digest in inputs:
    path = root / name
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest: raise ValueError(f'Unexpected source hash: {name}')
    samples, rate = sf.read(str(path), dtype='float32')
    if samples.ndim != 1 or rate not in (16000, 48000): raise ValueError('Unexpected source format')
    audio.append(soxr.resample(samples, rate, 16000) if rate != 16000 else samples)
enrollment, target, other = audio[0][:6*16000], audio[1][:7*16000], audio[2][48000:48000+7*16000]
if len(enrollment) != 96000 or len(target) != 112000 or len(other) != len(target): raise ValueError('Source too short')
rms = lambda signal: np.sqrt(np.mean(signal.astype(np.float64)**2))
if min(rms(target), rms(other)) < 1e-8: raise ValueError('Silent source')
other = other * (rms(target) / rms(other)); mixture = target + other
if np.max(np.abs(mixture)) >= 1 or np.max(np.abs(enrollment)) >= 1: raise ValueError('Fixture would clip')
paths = [root / 'mls-sidon-natural/native-enrollment-16k.wav', root / 'mls-sidon-natural/native-mixture-16k.wav']
if any(path.exists() for path in paths): raise FileExistsError('Preserve existing fixtures')
for path, samples in zip(paths, [enrollment, np.concatenate((np.zeros(32000), mixture, np.zeros(48000)))], strict=True):
    pcm = np.rint(samples * 32768).clip(-32768, 32767).astype('<i2')
    with path.open('xb') as target_file, wave.open(target_file, 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(pcm.tobytes())
    print(f'{path.name} sha256={hashlib.sha256(path.read_bytes()).hexdigest()} samples={len(pcm)}')
