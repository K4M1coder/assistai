"""Create a non-overlapping competing-speaker-only research fixture."""
import hashlib
from pathlib import Path
import wave

import numpy as np
import soundfile as sf
import soxr

root = Path(__file__).resolve().parents[1] / '.cache'
target_path = root / 'mls-sidon-natural/1406_1028_000001.flac'
other_path = root / 'fleurs-fr-118005971910520590.wav'
output = root / 'mls-sidon-natural/native-background-only-16k.wav'
if output.exists(): raise FileExistsError(output)
for path, expected in [(target_path, 'e769454a1922457df8580baf95ca2bfd4b0ffeb526f1ac61fa43c5ab77170431'),
                       (other_path, '12e953bde5e4c50ef4280bbd94be79a810788c0494069389035bf928731eb5f7')]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected: raise ValueError('Unexpected source hash')
target, rate = sf.read(str(target_path), dtype='float32')
if target.ndim != 1 or rate != 48000: raise ValueError('Unexpected target format')
target = soxr.resample(target, rate, 16000)[:112000]
with wave.open(str(other_path), 'rb') as source:
    if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 16000): raise ValueError('Unexpected competitor format')
    source.setpos(48000)
    other = np.frombuffer(source.readframes(112000), dtype='<i2').astype(np.float32) / 32768
if len(target) != 112000 or len(other) != len(target): raise ValueError('Source too short')
rms = lambda x: np.sqrt(np.mean(x.astype(np.float64)**2))
if min(rms(target), rms(other)) < 1e-8: raise ValueError('Silent source')
other *= rms(target) / rms(other)
if np.max(np.abs(other)) >= 1: raise ValueError('Fixture would clip')
samples = np.concatenate((np.zeros(32000), other, np.zeros(48000)))
pcm = np.rint(samples * 32768).clip(-32768, 32767).astype('<i2')
with output.open('xb') as target_file, wave.open(target_file, 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(pcm.tobytes())
print(f'sha256={hashlib.sha256(output.read_bytes()).hexdigest()} samples={len(pcm)}')
