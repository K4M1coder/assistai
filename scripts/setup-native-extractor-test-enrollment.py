"""Convert the existing synthetic research enrollment for the Windows client."""
import hashlib
from pathlib import Path
import wave

import numpy as np
from scipy.signal import resample_poly

root = Path(__file__).resolve().parents[1]
source_path = root / '.cache/tse-enroll.wav'
output_path = root / '.cache/tse-enroll-batched-test-16k.wav'
if output_path.exists(): raise FileExistsError(output_path)
if hashlib.sha256(source_path.read_bytes()).hexdigest() != '600dbd865066cfda07e8a2fc63cea169e2b2126b33e5d685660b1aeb1e21e24e':
    raise ValueError('Unexpected synthetic enrollment hash')
with wave.open(str(source_path), 'rb') as source:
    if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 22050):
        raise ValueError('Unexpected synthetic enrollment format')
    pcm = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)
samples = np.rint(resample_poly(pcm, 320, 441)).clip(-32768, 32767).astype('<i2')
with output_path.open('xb') as target, wave.open(target, 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(samples.tobytes())
print(f'source_sha256={hashlib.sha256(source_path.read_bytes()).hexdigest()} output_sha256={hashlib.sha256(output_path.read_bytes()).hexdigest()} samples={len(samples)}')
