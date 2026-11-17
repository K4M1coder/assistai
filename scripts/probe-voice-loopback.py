"""Synthetic file audio through the real gateway; transcribe its reply independently."""
import asyncio
import argparse
import importlib.util
import json
import os
from pathlib import Path
import socket as net_socket
import subprocess
import tempfile
import time
import urllib.request
import wave

import numpy as np
import soxr
from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def expected_answer_present(text, expected):
    asr = load_module('coding_asr_tokens', 'probe-asr-coding.py')
    return bool(set(asr.tokens(text)) & expected)


async def main(scenario='math'):
    spoken = load_module('spoken', 'probe-spoken-session-recall.py')
    asr = load_module('coding_asr', 'probe-asr-coding.py')
    question, expected = {
        'math': ('Combien font deux plus trois ? Réponds en un mot.', {'cinq', '5'}),
        'capital': ('Quelle est la capitale de la France ? Réponds en un mot.', {'paris'}),
    }[scenario]
    pcm = await asyncio.to_thread(spoken.synthesize, question)
    # A synthetic WAV exercises the same file-based input path requested by the operator.
    with tempfile.NamedTemporaryFile(prefix='voice-loopback-', suffix='.wav', dir=ROOT / '.cache', delete=False) as temp:
        filename = Path(temp.name)
    with net_socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
    env = dict(os.environ, ASSISTAI_GATEWAY_PORT=str(port), ASSISTAI_DB_PATH=':memory:',
               ASSISTAI_OPENCODE_URL='', ASSISTAI_LFM_REALTIME_URL='', ASSISTAI_BUDGET_SAMPLE_PATH='',
               ASSISTAI_RESOURCE_STATUS_PATH='', ASSISTAI_SHARED_RESERVATIONS_PATH='',
               ASSISTAI_ASR_URL='ws://127.0.0.1:18082/asr', ASSISTAI_LLM_URL='http://127.0.0.1:18084/v1',
               ASSISTAI_TTS_URL='http://127.0.0.1:18081')
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
            except OSError:
                if time.monotonic() > deadline: raise TimeoutError('Gateway startup timed out')
                await asyncio.sleep(.1)
        with wave.open(str(filename), 'wb') as output:
            output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000); output.writeframes(pcm)
        with wave.open(str(filename), 'rb') as source:
            pcm = source.readframes(source.getnframes())
        response = bytearray(); transcript = ''; answer = ''; sample_rate = None
        async with connect(f'ws://127.0.0.1:{port}/voice') as socket:
            while True:
                event = json.loads(await asyncio.wait_for(socket.recv(), 20))
                if event.get('type') == 'asr.ready': break
                if event.get('type') == 'error': raise RuntimeError(event.get('message'))
            await socket.send(json.dumps({'type':'audio.start'}))
            for offset in range(0, len(pcm), 3200):
                await socket.send(pcm[offset:offset + 3200]); await asyncio.sleep(.1)
            await socket.send(json.dumps({'type':'audio.end'}))
            while True:
                event = await asyncio.wait_for(socket.recv(), 90)
                if isinstance(event, bytes):
                    response.extend(event)
                    if len(response) > 4 * 1024 * 1024: raise RuntimeError('Audio exceeded probe limit')
                    continue
                event = json.loads(event); kind = event.get('type')
                if kind == 'user.text': transcript = event.get('text', '')
                elif kind == 'assistant.text': answer = event.get('text', '')
                elif kind == 'speech.start': sample_rate = event.get('sample_rate')
                elif kind == 'speech.end': break
                elif kind in ('error', 'asr.empty', 'task.started'): raise RuntimeError(f'Unexpected gateway event: {kind}')
        if not answer or not transcript or not response or len(response) % 2 or not isinstance(sample_rate, int):
            raise RuntimeError('Incomplete spoken response')
        samples = np.frombuffer(response, dtype='<i2').astype(np.float32)
        converted = np.clip(soxr.resample(samples, sample_rate, 16000), -32768, 32767).astype('<i2').tobytes()
        candidate = ROOT / '.cache/kyutai-crisp-research/kyutai-stt-1b-q4_k.gguf'
        executable = ROOT / '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
        heard, elapsed = await asyncio.to_thread(asr.recognize_crisp, converted + bytes(32000), executable, candidate, 'kyutai-stt')
        answered = expected_answer_present(answer, expected)
        heard_answer = expected_answer_present(heard, expected)
        print(json.dumps({'question':question, 'input_transcript':transcript, 'assistant_text':answer,
                          'output_asr':heard, 'normalized_wer':asr.word_error(answer, heard),
                          'expected_answer_in_text':answered, 'expected_answer_in_output_asr':heard_answer,
                          'output_audio_bytes':len(response), 'output_sample_rate':sample_rate,
                          'candidate_ms_including_load':elapsed, 'audio_synthetic':True,
                          'physical_devices_opened':False, 'audio_saved_after_run':False}, ensure_ascii=False), flush=True)
        if not answered or not heard_answer:
            raise RuntimeError('Expected answer was not present in both text and output transcription')
    finally:
        if child.poll() is None:
            child.terminate()
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=5)
        filename.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--scenario', choices=('math', 'capital'), default='math')
    asyncio.run(main(parser.parse_args().scenario))
