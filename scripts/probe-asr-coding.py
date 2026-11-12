"""Evaluate fixed synthetic French coding phrases against the existing loopback ASR."""
import asyncio
import importlib.util
import json
from pathlib import Path
import re
import time
import unicodedata

from websockets.asyncio.client import connect

spec = importlib.util.spec_from_file_location('spoken_recall', Path(__file__).with_name('probe-spoken-session-recall.py'))
spoken = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spoken)

CASES = [
    ('direction', "Corrige la fonction pour faire une addition au lieu d'une soustraction.", ('addition', 'soustraction')),
    ('negation', 'Ne supprime pas le fichier. Lis son contenu.', ('supprime', 'pas', 'fichier')),
    ('filename', 'Ouvre le fichier calculator point py et lis son contenu.', ('calculator', 'py')),
]


def tokens(text):
    normalized = unicodedata.normalize('NFKD', text.casefold())
    normalized = ''.join(c for c in normalized if not unicodedata.combining(c))
    return re.findall(r'[^\W_]+', normalized, re.UNICODE)


def word_error(reference, hypothesis):
    a, b = tokens(reference), tokens(hypothesis)
    previous = list(range(len(b) + 1))
    for i, token in enumerate(a, 1):
        current = [i]
        for j, other in enumerate(b, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (token != other)))
        previous = current
    return previous[-1] / len(a) if a else None


async def recognize(pcm):
    result = []
    async with connect('ws://127.0.0.1:18082/asr') as ws:
        ready = json.loads(await asyncio.wait_for(ws.recv(), 15))
        if ready.get('type') != 'ready': raise RuntimeError('ASR unavailable')
        for offset in range(0, len(pcm), 3200):
            await ws.send(pcm[offset:offset + 3200]); await asyncio.sleep(.1)
        await ws.send(json.dumps({'type':'end'}))
        while True:
            event = json.loads(await asyncio.wait_for(ws.recv(), 30))
            if event.get('type') in ('segment', 'final') and event.get('text'): result.append(event['text'])
            if event.get('type') == 'final': return ' '.join(result)


async def main():
    for label, reference, markers in CASES:
        pcm = await asyncio.to_thread(spoken.synthesize, reference)
        started = time.monotonic(); hypothesis = await recognize(pcm)
        found = set(tokens(hypothesis))
        print(json.dumps({'case':label, 'reference':reference, 'hypothesis':hypothesis,
                          'wer':round(word_error(reference, hypothesis), 3),
                          'markers_present':{marker:marker in found for marker in markers},
                          'marker_order_matches': all(marker in found for marker in markers) and
                              [tokens(hypothesis).index(marker) for marker in markers] == sorted(tokens(hypothesis).index(marker) for marker in markers),
                          'elapsed_ms':round((time.monotonic()-started)*1000),
                          'physical_devices_opened':False, 'audio_saved':False}, ensure_ascii=False), flush=True)


if __name__ == '__main__': asyncio.run(main())
