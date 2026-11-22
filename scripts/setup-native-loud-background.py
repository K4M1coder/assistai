"""Create a louder, non-clipping version of the pinned background-only fixture."""
import hashlib
from pathlib import Path
import wave

import numpy as np

root = Path(__file__).resolve().parents[1] / '.cache/mls-sidon-natural'
source, output = root / 'native-background-only-16k.wav', root / 'native-background-loud-16k.wav'
if output.exists(): raise FileExistsError(output)
if hashlib.sha256(source.read_bytes()).hexdigest() != '17e95528a9e84888bed3c2359753fe1ee21973785c2e3e9a6c34199f42de60f2': raise ValueError('Unexpected source hash')
with wave.open(str(source), 'rb') as wav:
    if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000): raise ValueError('Unexpected source format')
    samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float64) * 1.5
if np.max(np.abs(samples)) > 32767: raise ValueError('Fixture would clip')
with output.open('xb') as target, wave.open(target, 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(np.rint(samples).astype('<i2').tobytes())
print(f'sha256={hashlib.sha256(output.read_bytes()).hexdigest()} peak={np.max(np.abs(samples)):.0f}')
