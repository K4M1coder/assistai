"""Experimental buffered CPU Kyutai ASR using a local CrispASR checkpoint."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import wave

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

ROOT = Path(__file__).resolve().parents[1]
EXECUTABLE = ROOT / '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
MODEL = ROOT / '.cache/kyutai-crisp-research/kyutai-stt-1b-q4_k.gguf'
MAX_FRAME_BYTES = 32000
MAX_UTTERANCE_BYTES = 960000  # 30 seconds of 16 kHz mono PCM16.
MAX_CONNECTIONS = 4
app = FastAPI()
worker = asyncio.Lock()
pending_jobs = 0
MAX_PENDING_JOBS = 2  # One running transcription and at most one waiting.
active_connections = 0


async def serialized_transcribe(pcm):
    global pending_jobs
    if pending_jobs >= MAX_PENDING_JOBS:
        raise RuntimeError('Buffered ASR is busy')
    pending_jobs += 1
    started = False
    async def run():
        nonlocal started
        async with worker:
            started = True
            return await asyncio.to_thread(transcribe, pcm)
    # A cancelled client must not cancel the task holding the lock: Python
    # cannot stop the underlying thread, which may still hold a model in RAM.
    job = asyncio.create_task(run())
    def finished(done):
        global pending_jobs
        pending_jobs -= 1
        if not done.cancelled():
            done.exception()  # Observe errors even if the caller has disconnected.
    job.add_done_callback(finished)
    try:
        return await asyncio.shield(job)
    except asyncio.CancelledError:
        if not started:
            job.cancel()
        raise


def check_budget(min_available=6 * 1024**3):
    path = os.environ.get('ASSISTAI_KYUTAI_BUDGET_PATH')
    if not path: raise RuntimeError('ASR resource sample is not configured')
    sample = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    from datetime import datetime, timezone
    observed = datetime.fromisoformat(sample['observedAt'].replace('Z', '+00:00'))
    age = (datetime.now(timezone.utc) - observed).total_seconds()
    values = [sample.get(key) for key in ('dedicatedBytes', 'sharedBytes', 'availableRamBytes')]
    if not 0 <= age <= 5 or any(type(value) is not int or value < 0 for value in values):
        raise RuntimeError('ASR resource sample is stale or invalid')
    if values[0] > 22 * 1024**3 or values[1] > 256 * 1024**2 or values[2] < min_available:
        raise RuntimeError('ASR resource threshold exceeded')


def transcribe(pcm):
    check_budget(min_available=8 * 1024**3)
    with tempfile.NamedTemporaryFile(prefix='kyutai-utterance-', suffix='.wav', dir=ROOT / '.cache', delete=False) as output:
        filename = Path(output.name)
    process = None
    try:
        with wave.open(str(filename), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
            output.writeframes(pcm + bytes(32000))
        process = subprocess.Popen([str(EXECUTABLE), '--backend', 'kyutai-stt', '-m', str(MODEL), '-f', str(filename),
                                    '-ng', '-t', '2', '-nt', '-np', '-l', 'fr', '--lid-backend', 'off', '--no-punctuation'],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        deadline = time.monotonic() + 45
        while True:
            try:
                stdout, _ = process.communicate(timeout=0.5)
                break
            except subprocess.TimeoutExpired:
                check_budget()
                if time.monotonic() >= deadline: raise TimeoutError('ASR timed out')
        check_budget()
        if process.returncode != 0 or not stdout.strip(): raise RuntimeError('ASR process failed')
        return stdout.decode('utf-8', errors='replace').strip()
    finally:
        if process is not None and process.poll() is None:
            process.kill(); process.wait(timeout=5)
        filename.unlink(missing_ok=True)


@app.get('/health')
async def health():
    try: check_budget(min_available=8 * 1024**3); budget_ready = True
    except (OSError, ValueError, KeyError, TypeError, RuntimeError): budget_ready = False
    ready = EXECUTABLE.is_file() and MODEL.is_file() and budget_ready
    return {'status': 'ready' if ready else 'unavailable', 'engine': 'CrispASR CPU',
            'model': MODEL.name, 'language': 'fr', 'sample_rate': 16000,
            'mode': 'buffered-utterance', 'model_residency': 'loaded-per-request',
            'resource_guard_configured': bool(os.environ.get('ASSISTAI_KYUTAI_BUDGET_PATH')),
            'resource_headroom_observed': budget_ready}


@app.websocket('/asr')
async def asr(socket: WebSocket):
    global active_connections
    await socket.accept()
    if active_connections >= MAX_CONNECTIONS:
        await socket.close(code=1013, reason='ASR connection limit reached')
        return
    active_connections += 1
    try:
        await serve_asr(socket)
    finally:
        active_connections -= 1


async def serve_asr(socket: WebSocket):
    if not EXECUTABLE.is_file() or not MODEL.is_file():
        await socket.close(code=1013, reason='ASR files unavailable')
        return
    audio = bytearray()
    await socket.send_json({'type': 'ready', 'language': 'fr', 'sample_rate': 16000})
    try:
        while True:
            event = await socket.receive()
            if event['type'] == 'websocket.disconnect': break
            data = event.get('bytes')
            if data is not None:
                if not data or len(data) > MAX_FRAME_BYTES or len(data) % 2 or len(audio) + len(data) > MAX_UTTERANCE_BYTES:
                    await socket.close(code=1003, reason='Invalid or oversized PCM16 utterance')
                    break
                audio.extend(data)
                continue
            try: control = json.loads(event.get('text') or '')
            except json.JSONDecodeError:
                await socket.close(code=1003, reason='Invalid control message')
                break
            if control.get('type') == 'reset':
                audio.clear()
                await socket.send_json({'type': 'reset'})
            elif control.get('type') == 'end':
                pcm = bytes(audio); audio.clear()
                if not pcm:
                    await socket.send_json({'type': 'final', 'text': ''})
                    continue
                try:
                    text = await serialized_transcribe(pcm)
                    await socket.send_json({'type': 'final', 'text': text})
                except Exception:
                    await socket.send_json({'type': 'error', 'text': 'Buffered ASR failed'})
                    await socket.send_json({'type': 'final', 'text': ''})
            else:
                await socket.close(code=1003, reason='Unknown control message')
                break
    except WebSocketDisconnect:
        pass
