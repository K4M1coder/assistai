"""Prepare fixed one-second PCM chunks with a silence tail for duplex tests."""
from pathlib import Path
import math
import wave

root = Path(__file__).resolve().parent.parent / '.cache'
for language in ('english', 'french'):
    folder = root / f'omni-{language}'
    with wave.open(str(folder / 'utterance.wav'), 'rb') as source:
        assert (source.getnchannels(), source.getsampwidth(), source.getframerate()) == (1, 2, 16000)
        data = source.readframes(source.getnframes())
    speech_chunks = math.ceil(len(data) / 32000)
    count = speech_chunks + 5
    data = data.ljust(count * 32000, b'\0')
    for index in range(count):
        with wave.open(str(folder / f'{language}_{index:04}.wav'), 'wb') as target:
            target.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
            target.writeframes(data[index * 32000:(index + 1) * 32000])
    print(f'{language}: {speech_chunks} speech chunks + 5 silent chunks = {count}')
