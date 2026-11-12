"""Evaluate fixed synthetic French coding phrases against the existing loopback ASR."""
import asyncio
import argparse
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
import unicodedata
import wave

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


def recognize_crisp(pcm, executable, model):
    root = Path(__file__).resolve().parents[1]
    executable, model = executable.resolve(strict=True), model.resolve(strict=True)
    # This is synthetic audio only. A temporary WAV is needed by the file-oriented CLI.
    with tempfile.NamedTemporaryFile(prefix='synthetic-asr-', suffix='.wav', dir=root / '.cache', delete=False) as temporary:
        name = Path(temporary.name)
    try:
        with wave.open(str(name), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000); output.writeframes(pcm)
        started = time.monotonic()
        result = subprocess.run([str(executable), '--backend', 'fastconformer-ctc', '-m', str(model), '-f', str(name),
                                 '-ng', '-t', '2', '-nt', '-np'], capture_output=True, text=True, encoding='utf-8',
                                errors='replace', timeout=45, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode or not result.stdout.strip():
            raise RuntimeError(f'CrispASR failed ({result.returncode}): {result.stderr[-1000:]}')
        return result.stdout.strip(), round((time.monotonic()-started)*1000)
    finally:
        name.unlink(missing_ok=True)


async def main(crisp_executable=None, crisp_model=None):
    for label, reference, markers in CASES:
        pcm = await asyncio.to_thread(spoken.synthesize, reference)
        started = time.monotonic(); hypothesis = await recognize(pcm)
        found = set(tokens(hypothesis))
        result = {'case':label, 'reference':reference, 'hypothesis':hypothesis,
                          'wer':round(word_error(reference, hypothesis), 3),
                          'markers_present':{marker:marker in found for marker in markers},
                          'marker_order_matches': all(marker in found for marker in markers) and
                              [tokens(hypothesis).index(marker) for marker in markers] == sorted(tokens(hypothesis).index(marker) for marker in markers),
                          'elapsed_ms':round((time.monotonic()-started)*1000),
                          'physical_devices_opened':False, 'permanent_audio_saved':False}
        if crisp_executable and crisp_model:
            candidate, elapsed = await asyncio.to_thread(recognize_crisp, pcm, crisp_executable, crisp_model)
            candidate_tokens = tokens(candidate)
            result['candidate'] = {'engine':'CrispASR fastconformer-ctc CPU', 'hypothesis':candidate,
                'wer':round(word_error(reference, candidate), 3), 'elapsed_ms_including_model_load':elapsed,
                'markers_present':{marker:marker in candidate_tokens for marker in markers},
                'marker_order_matches':all(marker in candidate_tokens for marker in markers) and
                    [candidate_tokens.index(marker) for marker in markers] == sorted(candidate_tokens.index(marker) for marker in markers)}
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--crisp-executable', type=Path)
    parser.add_argument('--crisp-model', type=Path)
    args = parser.parse_args()
    if bool(args.crisp_executable) != bool(args.crisp_model): parser.error('Provide both CrispASR executable and model')
    asyncio.run(main(args.crisp_executable, args.crisp_model))
