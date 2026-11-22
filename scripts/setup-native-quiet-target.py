"""Create a mixture with half target amplitude and unchanged competitor."""
import hashlib
from pathlib import Path
import wave

import numpy as np

root = Path(__file__).resolve().parents[1] / '.cache/mls-sidon-natural'
inputs = [('native-mixture-16k.wav', '10fd59e283266f4060faccea05dcaa622e5d2e1a384dc582a39411da64511aaf'),
          ('native-background-only-16k.wav', '17e95528a9e84888bed3c2359753fe1ee21973785c2e3e9a6c34199f42de60f2')]
signals = []
for name, digest in inputs:
    path = root / name
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest: raise ValueError('Unexpected source hash')
    with wave.open(str(path), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000): raise ValueError('Unexpected format')
        signals.append(np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float64))
if signals[0].shape != signals[1].shape: raise ValueError('Different durations')
samples = np.rint((signals[0] + signals[1]) / 2).astype('<i2')
output = root / 'native-quiet-target-16k.wav'
with output.open('xb') as target, wave.open(target, 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(samples.tobytes())
print(f'sha256={hashlib.sha256(output.read_bytes()).hexdigest()} samples={len(samples)}')
