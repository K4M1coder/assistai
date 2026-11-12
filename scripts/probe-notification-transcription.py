"""Check synthetic task notification audio with local TTS and local ASR."""
import asyncio
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

import numpy as np
import soxr
from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parents[1]


def contains_marker(transcript, marker):
    return marker in transcript.lower().split()


async def run(marker):
    with tempfile.TemporaryDirectory(prefix='notification-probe-', dir=ROOT / '.cache') as directory:
        database = str(Path(directory) / 'events.sqlite')
        with socket.socket() as reserve:
            reserve.bind(('127.0.0.1', 0)); port = reserve.getsockname()[1]
        env = dict(os.environ, ASSISTAI_GATEWAY_PORT=str(port), ASSISTAI_DB_PATH=database,
                   ASSISTAI_ENABLE_SESSION_RESUME='1', ASSISTAI_OPENCODE_URL='', ASSISTAI_LFM_REALTIME_URL='',
                   ASSISTAI_LLM_URL='http://127.0.0.1:18084/v1', ASSISTAI_TTS_URL='http://127.0.0.1:18081',
                   ASSISTAI_ASR_URL='ws://127.0.0.1:18082/asr')
        env.pop('ASSISTAI_BUDGET_SAMPLE_PATH', None)
        child = subprocess.Popen(['node', str(ROOT / 'prototype/gateway.mjs')], cwd=ROOT, env=env,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            deadline = time.monotonic() + 15
            while True:
                if child.poll() is not None: raise RuntimeError('Temporary gateway exited')
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as response:
                        if response.status == 200: break
                except (OSError, urllib.error.URLError):
                    if time.monotonic() > deadline: raise TimeoutError('Gateway startup timed out')
                    await asyncio.sleep(.1)
            token = secrets.token_hex(32)
            session = hashlib.sha256(f'resume.{token}'.encode()).hexdigest()
            db = sqlite3.connect(database)
            try:
                db.execute('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)',
                           (uuid.uuid4().hex, session, 'synthetic', 'task.completed',
                            json.dumps({'task_id':'synthetic-task', 'text':f'Le résultat est {marker}.'}), '2026-11-12T00:00:00Z'))
                db.commit()
            finally:
                db.close()
            chunks = []; total = 0; rate = None; started = False
            async with connect(f'ws://127.0.0.1:{port}/voice', subprotocols=['assistai-v1', f'resume.{token}']) as ws:
                while True:
                    raw = await asyncio.wait_for(ws.recv(), 20)
                    if isinstance(raw, bytes):
                        if started:
                            total += len(raw)
                            if total > 4 * 1024 * 1024: raise RuntimeError('Synthetic audio exceeds limit')
                            chunks.append(raw)
                        continue
                    event = json.loads(raw); kind = event.get('type')
                    if kind == 'asr.ready': await ws.send(json.dumps({'type':'notification.speak','task_id':'synthetic-task'}))
                    elif kind == 'notification.started': started = True
                    elif kind == 'speech.start' and started: rate = event.get('sample_rate')
                    elif kind == 'speech.end' and started: break
                    elif kind in ('error','notification.rejected'): raise RuntimeError(f'{kind}: {event.get("message", "")}')
            audio = b''.join(chunks)
            if not audio or len(audio) % 2 or not isinstance(rate, int) or not 8000 <= rate <= 48000:
                raise RuntimeError('Invalid notification PCM')
            samples = np.frombuffer(audio, dtype='<i2').astype(np.float32)
            pcm = np.clip(soxr.resample(samples, rate, 16000), -32768, 32767).astype('<i2').tobytes()
            parts = []
            async with connect('ws://127.0.0.1:18082/asr') as ws:
                ready = json.loads(await asyncio.wait_for(ws.recv(), 10))
                if ready.get('type') != 'ready': raise RuntimeError('ASR is not ready')
                for offset in range(0, len(pcm), 32000): await ws.send(pcm[offset:offset + 32000])
                await ws.send(json.dumps({'type':'end'}))
                while True:
                    event = json.loads(await asyncio.wait_for(ws.recv(), 30))
                    if event.get('type') in ('segment','final') and event.get('text'): parts.append(event['text'])
                    if event.get('type') == 'final': break
            transcript = ' '.join(parts)
            matched = contains_marker(transcript, marker)
            print(json.dumps({'synthetic_result':f'Le résultat est {marker}.', 'asr_transcript':transcript,
                              'marker_recognized':matched, 'notification_audio_bytes':len(audio), 'sample_rate':rate,
                              'physical_audio_devices_opened':False, 'audio_saved':False}, ensure_ascii=False), flush=True)
            if not matched: raise RuntimeError('Synthetic marker was not recognized by the local ASR')
        finally:
            if child.poll() is None:
                child.terminate()
                try: child.wait(timeout=5)
                except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--marker', choices=('mangue', 'rouge'), default='mangue')
    asyncio.run(run(parser.parse_args().marker))
