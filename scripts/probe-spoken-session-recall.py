"""Synthetic French speech through the real local cascade across a reconnect."""
import asyncio
import argparse
import io
import json
from math import gcd
import os
import re
import secrets
import socket as net_socket
import subprocess
import time
import urllib.request
import wave

import numpy as np
import requests
from scipy.signal import resample_poly
from websockets.asyncio.client import connect


def exact_answer(answer, marker):
    return re.sub(r'[^a-zàâçéèêëîïôûùüÿñæœ]', '', answer.lower()) == marker


def synthesize(text):
    response = requests.post('http://127.0.0.1:18081/tts', data={'text': text}, timeout=60)
    response.raise_for_status()
    with wave.open(io.BytesIO(response.content), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError('Expected mono PCM16 TTS')
        rate = source.getframerate()
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)
    divisor = gcd(rate, 16000)
    return np.clip(resample_poly(samples, 16000 // divisor, rate // divisor), -32768, 32767).astype('<i2').tobytes()


async def spoken_turn(port, key, pcm):
    async with connect(f'ws://127.0.0.1:{port}/voice', subprotocols=['assistai-v1', f'resume.{key}']) as ws:
        while True:
            event = json.loads(await asyncio.wait_for(ws.recv(), 15))
            if event.get('type') == 'asr.ready': break
            if event.get('type') == 'error': raise RuntimeError(event.get('message'))
        await ws.send(json.dumps({'type': 'audio.start'}))
        for offset in range(0, len(pcm), 3200):
            await ws.send(pcm[offset:offset + 3200])
            await asyncio.sleep(.1)
        await ws.send(json.dumps({'type': 'audio.end'}))
        transcript, answer, audio_bytes = '', '', 0
        while True:
            message = await asyncio.wait_for(ws.recv(), 60)
            if isinstance(message, bytes): audio_bytes += len(message); continue
            event = json.loads(message)
            if event.get('type') == 'user.text': transcript = event.get('text', '')
            if event.get('type') == 'assistant.text': answer = event.get('text', '')
            if event.get('type') == 'speech.end': return transcript, answer, audio_bytes
            if event.get('type') in ('error', 'asr.empty'): raise RuntimeError(f"Gateway event: {event.get('type')}")


async def main(marker=None, scenario='colour'):
    options = ('bleu', 'rouge', 'jaune') if scenario == 'colour' else ('banane', 'ananas', 'tomate')
    if marker is not None and marker not in options: raise ValueError('Marker does not match scenario')
    marker = marker or secrets.choice(options)
    statement = f'Mon vélo est de couleur {marker}. Mémorise-le.' if scenario == 'colour' else f'Le mot secret est {marker}. Mémorise-le.'
    prompt = ('Quelle est la couleur de mon vélo ? Réponds uniquement par la couleur, sans explication.' if scenario == 'colour'
              else 'Quel est le mot secret ? Réponds uniquement par le mot, sans explication.')
    first = await asyncio.to_thread(synthesize, statement)
    question = await asyncio.to_thread(synthesize, prompt)
    with net_socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
    env = dict(os.environ, ASSISTAI_GATEWAY_PORT=str(port), ASSISTAI_DB_PATH=':memory:',
               ASSISTAI_ENABLE_SESSION_RESUME='1', ASSISTAI_OPENCODE_URL='', ASSISTAI_LFM_REALTIME_URL='',
               ASSISTAI_LLM_URL='http://127.0.0.1:18084/v1', ASSISTAI_TTS_URL='http://127.0.0.1:18081',
               ASSISTAI_ASR_URL='ws://127.0.0.1:18082/asr')
    process = subprocess.Popen(['node', 'prototype/gateway.mjs'], env=env, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        deadline = time.monotonic() + 10
        while True:
            if process.poll() is not None: raise RuntimeError('Temporary gateway exited')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as response:
                    if response.status == 200: break
            except (OSError, urllib.error.URLError):
                if time.monotonic() >= deadline: raise TimeoutError('Gateway startup timed out')
                await asyncio.sleep(.1)
        key = secrets.token_hex(32)
        t1, a1, b1 = await spoken_turn(port, key, first)
        t2, a2, b2 = await spoken_turn(port, key, question)
        t3, a3, b3 = await spoken_turn(port, secrets.token_hex(32), question)
        result = {'scenario': scenario, 'synthetic_marker': marker, 'first_transcript': t1, 'followup_transcript': t2, 'separate_transcript': t3,
                  'synthetic_recalled_answer': a2, 'synthetic_separate_answer': a3,
                  'first_transcript_contains_marker': marker in t1.lower(),
                  'same_session_recalled_marker': exact_answer(a2, marker),
                  'separate_session_repeated_marker': marker in a3.lower(),
                  'audio_bytes': [b1, b2, b3], 'gateway_history': 'volatile',
                  'physical_audio_devices_opened': False, 'synthetic_audio_saved': False}
        print(json.dumps(result, ensure_ascii=False), flush=True)
        if not result['first_transcript_contains_marker'] or not result['same_session_recalled_marker'] or result['separate_session_repeated_marker'] or not all((b1, b2, b3)):
            raise RuntimeError('Synthetic spoken recall check failed')
    finally:
        process.terminate()
        try: await asyncio.to_thread(process.wait, 5)
        except subprocess.TimeoutExpired:
            process.kill(); await asyncio.to_thread(process.wait, 5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', choices=('colour', 'secret'), default='colour')
    parser.add_argument('--marker', choices=('bleu', 'rouge', 'jaune', 'banane', 'ananas', 'tomate'))
    args = parser.parse_args()
    asyncio.run(main(args.marker, args.scenario))
