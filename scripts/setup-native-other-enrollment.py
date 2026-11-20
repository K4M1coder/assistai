"""Create a new 16 kHz competitor enrollment from a pinned public fixture."""
import hashlib
from pathlib import Path
import wave

import numpy as np

root = Path(__file__).resolve().parents[1] / '.cache'
source = root / 'fleurs-fr-118005971910520590.wav'
output = root / 'mls-sidon-natural/native-other-enrollment-16k.wav'
if output.exists(): raise FileExistsError(output)
if hashlib.sha256(source.read_bytes()).hexdigest() != '12e953bde5e4c50ef4280bbd94be79a810788c0494069389035bf928731eb5f7':
    raise ValueError('Unexpected source hash')
with wave.open(str(source), 'rb') as wav:
    if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000): raise ValueError('Unexpected source format')
    samples = np.frombuffer(wav.readframes(48000), dtype='<i2').astype(np.int32) * 64
if len(samples) != 48000 or np.max(np.abs(samples)) > 32767: raise ValueError('Invalid enrollment')
with output.open('xb') as target, wave.open(target, 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(samples.astype('<i2').tobytes())
print(f'sha256={hashlib.sha256(output.read_bytes()).hexdigest()} samples={len(samples)}')
