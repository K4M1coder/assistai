"""Evaluate one recorded research output against pinned digital sources and Vosk."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import wave

import numpy as np

root = Path(__file__).resolve().parents[1]
def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, root / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
probe = load_module('voxlock_probe', 'probe-voxlock.py')
metrics = load_module('correlation_probe', 'probe-browser-mixture-extraction.py')
def read(path, digest=None):
    raw = path.read_bytes(); actual = hashlib.sha256(raw).hexdigest()
    if digest and actual != digest: raise ValueError('Unexpected source hash')
    with wave.open(str(path), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000): raise ValueError('Unexpected format')
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768, actual
async def main():
    output, digest = read(Path(sys.argv[1]))
    folder = root / '.cache/mls-sidon-natural'
    mixture, _ = read(folder / 'native-mixture-16k.wav', '10fd59e283266f4060faccea05dcaa622e5d2e1a384dc582a39411da64511aaf')
    other, _ = read(folder / 'native-background-only-16k.wav', '17e95528a9e84888bed3c2359753fe1ee21973785c2e3e9a6c34199f42de60f2')
    mixture, other = mixture[32000:144000], other[32000:144000]
    if len(output) != len(mixture): raise ValueError('Unexpected output length')
    target = mixture - other
    print(json.dumps({'output_sha256':digest, 'transcript':await probe.recognize(output),
                      'target_correlation':metrics.peak_correlation(output, target),
                      'competitor_correlation':metrics.peak_correlation(output, other),
                      'physical_devices_opened':False}, ensure_ascii=False))
asyncio.run(main())
