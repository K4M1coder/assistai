"""Generate the local, synthetic 16 kHz French reset-recall test question."""
import io
from math import gcd
from pathlib import Path
import wave

import numpy as np
import requests
from scipy.signal import resample_poly

response = requests.post('http://127.0.0.1:18081/tts', data={'text': 'Quel est le mot secret ?'}, timeout=60)
response.raise_for_status()
with wave.open(io.BytesIO(response.content), 'rb') as source:
    if source.getnchannels() != 1 or source.getsampwidth() != 2:
        raise ValueError('Expected mono PCM16 from the local TTS service')
    rate = source.getframerate()
    samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)
divisor = gcd(rate, 16000)
samples = np.clip(resample_poly(samples, 16000 // divisor, rate // divisor), -32768, 32767).astype('<i2')
path = Path('.cache/reset-question.wav')
with wave.open(str(path), 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(16000)
    output.writeframes(samples.tobytes())
print(f'Wrote {path} ({len(samples)} samples)')
