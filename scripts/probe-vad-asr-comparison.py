"""Compare turn detection and local ASR on deterministic synthetic mixtures."""
import asyncio
import hashlib
import json
from pathlib import Path
import re
import wave

import numpy as np
from scipy.signal import resample_poly
from websockets.asyncio.client import connect

from prototype.native_turn import NativeTurnDetector
from prototype.silero_vad import SileroSpeechDetector

RATE, FRAME = 16000, 320
REFERENCE = 'quel est le mot secret'


def read_fixture(path):
    with wave.open(str(path), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError('Expected mono PCM16')
        rate = source.getframerate()
        audio = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768
    from math import gcd
    factor = gcd(rate, RATE)
    return resample_poly(audio, RATE // factor, rate // factor).astype(np.float32)


def word_error_rate(reference, observed):
    a, b = re.findall(r'\w+', reference.lower()), re.findall(r'\w+', observed.lower())
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (x != y)))
        previous = current
    return round(previous[-1] / len(a), 3)


def detect(audio, use_silero):
    detector = NativeTurnDetector(threshold=0.025)
    vad = SileroSpeechDetector('.cache/silero-vad-research/silero_vad/data/silero_vad.onnx') if use_silero else None
    turns, current, starts, ends = [], None, [], []
    pcm = np.clip(audio * 32768, -32768, 32767).astype('<i2').tobytes()
    pcm += bytes((-len(pcm)) % (FRAME * 2))
    for offset in range(0, len(pcm), FRAME * 2):
        frame = pcm[offset:offset + FRAME * 2]
        probability = vad.feed(frame) if vad else None
        speech_active = (probability is not None and probability >= 0.5) if vad else None
        for event in detector.feed(frame, speech_active=speech_active):
            if isinstance(event, bytes):
                if current is not None: current.extend(event)
            elif event['type'] == 'audio.start':
                starts.append(round(offset / 32 + 20)); current = bytearray()
            elif event['type'] == 'audio.end':
                ends.append(round(offset / 32 + 20)); turns.append(bytes(current)); current = None
    if current is not None: turns.append(bytes(current))
    return turns, starts, ends


async def recognize(pcm):
    async with connect('ws://127.0.0.1:18082/asr') as socket:
        ready = json.loads(await socket.recv())
        if ready.get('type') != 'ready': raise RuntimeError('ASR not ready')
        for offset in range(0, len(pcm), 3200): await socket.send(pcm[offset:offset + 3200])
        await socket.send(json.dumps({'type':'end'}))
        pieces = []
        while True:
            event = json.loads(await asyncio.wait_for(socket.recv(), 30))
            if event.get('type') in ('segment', 'final') and event.get('text'): pieces.append(event['text'])
            if event.get('type') == 'final': return ' '.join(pieces)


async def main():
    target_path, other_path = Path('.cache/reset-question.wav'), Path('.cache/tse-interferer.wav')
    target, other = read_fixture(target_path), read_fixture(other_path)
    pre, post, tail = RATE, RATE, int(0.8 * RATE)
    total = pre + len(target) + post + tail
    rng = np.random.default_rng(20261111)
    timebase = np.arange(total, dtype=np.float64) / RATE
    noise = rng.normal(0, 0.05, total).astype(np.float32)
    tones = (0.04 * (np.sin(2*np.pi*330*timebase) + 0.5*np.sin(2*np.pi*660*timebase))).astype(np.float32)
    competing = np.resize(other, total)
    competing = competing * (0.05 / np.sqrt(np.mean(competing * competing)))
    backgrounds = {'clean':np.zeros(total, dtype=np.float32),'white_noise':noise,'harmonic_tones':tones,'other_voice':competing}
    results = []
    for label, background in backgrounds.items():
        signal = background.copy(); signal[pre:pre + len(target)] += target
        signal[-tail:] = 0
        for name in ('energy', 'silero'):
            turns, starts, ends = detect(signal, name == 'silero')
            transcripts = [await recognize(turn) for turn in turns if turn]
            transcript = ' '.join(transcripts)
            results.append({'condition':label,'detector':name,'starts_ms':starts,'ends_ms':ends,'turns':len(turns),
                            'transcript':transcript,'wer':word_error_rate(REFERENCE, transcript)})
    print(json.dumps({'target_sha256':hashlib.sha256(target_path.read_bytes()).hexdigest(),
                      'other_sha256':hashlib.sha256(other_path.read_bytes()).hexdigest(),
                      'target_start_ms':1000,'target_end_ms':round((pre + len(target)) / 16),
                      'reference':REFERENCE,'cases':results,
                      'note':'Single synthetic phrase and synthetic backgrounds; not a real-room benchmark.'},ensure_ascii=False))


if __name__ == '__main__': asyncio.run(main())
