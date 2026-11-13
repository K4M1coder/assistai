"""Create a synthetic two-voice PCM fixture without using an audio device."""
import argparse
import json
from pathlib import Path
import wave

import numpy as np


def read_pcm(path):
    with wave.open(str(path), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 16000):
            raise ValueError('Input must be mono 16 kHz PCM16')
        return np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='New WAV path; existing files are never overwritten')
    args = parser.parse_args()
    target = read_pcm(Path('.cache/omni-french/utterance.wav'))
    interference = read_pcm(Path('.cache/omni-english/utterance.wav'))
    if not len(target) or not len(interference):
        raise ValueError('Inputs must contain audio')
    interference = np.resize(interference, len(target)) * 0.35
    mixed = target + interference
    clipped = int(np.count_nonzero(np.abs(mixed) > 32767))
    snr = float(20 * np.log10(np.linalg.norm(target) / np.linalg.norm(interference)))
    with args.output.open('xb') as handle:
        with wave.open(handle, 'wb') as output:
            output.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
            output.writeframes(bytes(64000))
            output.writeframes(np.clip(mixed, -32768, 32767).astype('<i2').tobytes())
            output.writeframes(bytes(96000))
    print(json.dumps({'snr_db': round(snr, 2), 'clipped_samples': clipped, 'duration_s': len(target) / 16000}))


if __name__ == '__main__':
    main()
