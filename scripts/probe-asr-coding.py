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
FIXTURE_CASES = [
    ('fixture-name', 'Quel est le mot écrit dans le fichier fixture point texte ?', ('fixture', 'texte')),
    ('fixture-spelled', 'Lis le fichier f i x t u r e point t x t.', ('f', 'i', 'x', 't', 'u', 'r', 'e')),
]
VOICE_CASES = [
    ('math', 'Combien font deux plus trois ? Réponds en un mot.', ('deux', 'trois')),
    ('capital', 'Quelle est la capitale de la France ? Réponds en un mot.', ('capitale', 'france')),
]
EDIT_CASES = [
    ('full-edit', "Dans le fichier calculator point py, corrige la fonction add pour faire une addition au lieu d'une soustraction. Ne change rien d'autre.", ('calculator', 'py', 'add', 'addition', 'soustraction')),
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


def recognize_crisp(pcm, executable, model, backend='fastconformer-ctc', seed=None, no_fallback=False, allow_empty=False, threads=2):
    if backend not in ('fastconformer-ctc', 'kyutai-stt'):
        raise ValueError('Unsupported research backend')
    root = Path(__file__).resolve().parents[1]
    executable, model = executable.resolve(strict=True), model.resolve(strict=True)
    # This is synthetic audio only. A temporary WAV is needed by the file-oriented CLI.
    with tempfile.NamedTemporaryFile(prefix='synthetic-asr-', suffix='.wav', dir=root / '.cache', delete=False) as temporary:
        name = Path(temporary.name)
    try:
        with wave.open(str(name), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000); output.writeframes(pcm)
        started = time.monotonic()
        try:
            command = [str(executable), '--backend', backend, '-m', str(model), '-f', str(name),
                       '-ng', '-t', str(threads), '-nt', '-np', '-l', 'fr', '--lid-backend', 'off', '--no-punctuation']
            if seed is not None: command += ['--seed', str(seed)]
            if no_fallback: command += ['--no-fallback']
            result = subprocess.run(command,
                                    stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding='utf-8',
                                    errors='replace', timeout=45, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except subprocess.TimeoutExpired as error:
            diagnostic = error.stderr or b''
            if isinstance(diagnostic, bytes): diagnostic = diagnostic.decode('utf-8', errors='replace')
            raise RuntimeError(f'CrispASR timed out after 45 seconds; stderr: {diagnostic[-1000:]}') from error
        if result.returncode or (not allow_empty and not result.stdout.strip()):
            raise RuntimeError(f'CrispASR failed ({result.returncode}): {result.stderr[-1000:]}')
        return result.stdout.strip(), round((time.monotonic()-started)*1000)
    finally:
        name.unlink(missing_ok=True)


async def main(crisp_executable=None, crisp_model=None, cases=CASES, crisp_backend='fastconformer-ctc', compare_padding=False):
    for label, reference, markers in cases:
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
        print(json.dumps(result, ensure_ascii=False), flush=True)
        if crisp_executable and crisp_model:
            for padding_ms in ([0, 1000] if compare_padding else [0]):
                padded_pcm = pcm + bytes(32 * padding_ms)  # 16 kHz mono PCM16
                candidate, elapsed = await asyncio.to_thread(recognize_crisp, padded_pcm, crisp_executable, crisp_model, crisp_backend)
                candidate_tokens = tokens(candidate)
                candidate_result = {'case':label, 'engine':f'CrispASR {crisp_backend} CPU', 'hypothesis':candidate,
                    'trailing_silence_ms':padding_ms, 'wer':round(word_error(reference, candidate), 3), 'elapsed_ms_including_model_load':elapsed,
                    'markers_present':{marker:marker in candidate_tokens for marker in markers},
                    'marker_order_matches':all(marker in candidate_tokens for marker in markers) and
                        [candidate_tokens.index(marker) for marker in markers] == sorted(candidate_tokens.index(marker) for marker in markers)}
                print(json.dumps(candidate_result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--crisp-executable', type=Path)
    parser.add_argument('--crisp-model', type=Path)
    parser.add_argument('--crisp-backend', choices=('fastconformer-ctc', 'kyutai-stt'), default='fastconformer-ctc')
    parser.add_argument('--compare-padding', action='store_true', help='Compare candidate outputs with and without one second of trailing silence')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--fixture-only', action='store_true', help='Use synthetic filename-focused phrases')
    group.add_argument('--voice-only', action='store_true', help='Use synthetic conversational control phrases')
    group.add_argument('--edit-only', action='store_true', help='Use the full synthetic coding request')
    args = parser.parse_args()
    if bool(args.crisp_executable) != bool(args.crisp_model): parser.error('Provide both CrispASR executable and model')
    cases = FIXTURE_CASES if args.fixture_only else VOICE_CASES if args.voice_only else EDIT_CASES if args.edit_only else CASES
    asyncio.run(main(args.crisp_executable, args.crisp_model, cases, args.crisp_backend, args.compare_padding))
