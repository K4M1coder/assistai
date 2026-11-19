"""Inspect cached synthetic native outputs without loading a model or opening devices."""
import hashlib
import json
from pathlib import Path
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    'lfm3-omni-audio-f16-output.wav', 'lfm3-omni-audio-output.wav',
    'lfm3-omni-capital-output.wav', 'lfm3-omni-concurrent-output.wav',
    'lfm3-omni-interleaved-f16-output.wav', 'lfm3-omni-interleaved-output.wav',
    'lfm3-omni-interleaved-q8-output.wav', 'lfm3-omni-interleaved-q8-repeat2-output.wav',
)


def analyze(path):
    with wave.open(str(path), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 24000):
            raise ValueError(f'Unexpected WAV format: {path.name}')
        pcm = source.readframes(source.getnframes())
    samples = np.frombuffer(pcm, dtype='<i2').astype(np.int32)
    if len(samples) < 2:
        raise ValueError(f'Insufficient audio: {path.name}')
    jumps = np.abs(np.diff(samples))
    # This is a hypothetical 0.96-second grid, not recorded event boundaries.
    step = 23040
    boundaries = range(step, len(samples), step)
    return {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'seconds': len(samples) / 24000, 'rms': round(float(np.sqrt(np.mean(samples.astype(float)**2))), 1),
            'peak': int(np.max(np.abs(samples))), 'jump_p99': float(np.percentile(jumps, 99)),
            'hypothetical_096s_boundary_jumps': [int(jumps[index - 1]) for index in boundaries]}


if __name__ == '__main__':
    print(json.dumps({'outputs': [analyze(ROOT / '.cache' / filename) for filename in FILES],
                      'physical_devices_opened': False, 'boundaries_are_observed_events': False}, ensure_ascii=False))
