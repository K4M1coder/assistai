"""Compare a fixed natural French utterance with and without overlapping speech."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('asr_coding', ROOT / 'scripts/probe-asr-coding.py')
asr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(asr)


def load(filename, expected):
    path = ROOT / '.cache' / filename
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f'Unexpected input hash: {filename}')
    with wave.open(str(path), 'rb') as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError('Expected 16 kHz mono PCM16')
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').astype(np.int32)


async def main():
    target = load('fleurs-fr-17559822372056259463.wav', 'ca0c712cd2098656ae5c35b5e515f8682356f44983814a2e1cf2d16beb1775cc') * 8
    other = load('fleurs-fr-118005971910520590.wav', '12e953bde5e4c50ef4280bbd94be79a810788c0494069389035bf928731eb5f7')[:len(target)]
    if len(other) != len(target):
        raise ValueError('Competing fixture is too short')
    reference = "Cela semble raisonnable, car la Terre n'a pas l'impression de bouger, n'est-ce pas ?"
    rows = []
    for gain in (0, 32, 64):
        mixture = target + other * gain
        if np.max(np.abs(mixture)) > 32767:
            raise ValueError('Mixture would clip')
        pcm = mixture.astype('<i2').tobytes()
        spoken = await asr.recognize(pcm)
        target_rms = float(np.sqrt(np.mean(target.astype(np.float64)**2)))
        other_rms = float(np.sqrt(np.mean((other.astype(np.float64)*gain)**2)))
        rows.append({'competing_gain': gain, 'target_gain': 8, 'target_rms': round(target_rms, 2),
                     'competing_rms': round(other_rms, 2), 'peak': int(np.max(np.abs(mixture))),
                     'pcm_sha256': hashlib.sha256(pcm).hexdigest(), 'transcript': spoken,
                     'target_wer': asr.word_error(reference, spoken)})
    print(json.dumps({'reference': reference, 'sample_rate': 16000, 'rows': rows,
                      'physical_devices_opened': False}, ensure_ascii=False), flush=True)


asyncio.run(main())
