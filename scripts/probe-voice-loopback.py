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


def straightforward_answer(text, scenario):
    """Accept only a few unambiguous short forms; this is not a semantic judge."""
    asr = load_module('coding_asr_tokens', 'probe-asr-coding.py')
    tokens = asr.tokens(text)
    if scenario == 'math':
        choices = (['cinq'], ['5'], ['la', 'reponse', 'est', 'cinq'], ['la', 'reponse', 'est', '5'],
                   ['deux', 'plus', 'trois', 'fait', 'cinq'], ['deux', 'plus', 'trois', 'fait', '5'],
                   ['deux', 'plus', 'trois', 'fait', 'cinq', 'reponse', 'cinq'],
                   ['deux', 'plus', 'trois', 'fait', 'cinq', 'la', 'reponse', 'est', 'cinq'])
    else:
        choices = (['paris'], ['la', 'reponse', 'est', 'paris'], ['la', 'capitale', 'de', 'la', 'france', 'est', 'paris'],
                   ['la', 'capitale', 'de', 'la', 'france', 'et', 'paris'])
    return tokens in choices


def input_intent_preserved(text, scenario):
    asr = load_module('coding_asr_tokens', 'probe-asr-coding.py')
    tokens = asr.tokens(text)
    if scenario == 'math': return any(tokens[i:i+3] == ['deux', 'plus', 'trois'] for i in range(len(tokens)-2))
    return 'capitale' in tokens and 'france' in tokens


async def main(scenario='math', input_asr='vosk', paired_input=False):
    spoken = load_module('spoken', 'probe-spoken-session-recall.py')
    asr = load_module('coding_asr', 'probe-asr-coding.py')
    question, expected = {
        'math': ('Combien font deux plus trois ? Réponds en un mot.', {'cinq', '5'}),
        'capital': ('Quelle est la capitale de la France ? Réponds en un mot.', {'paris'}),
    }[scenario]
    pcm = await asyncio.to_thread(spoken.synthesize, question)
    paired_text, paired_ms = None, None
    if paired_input:
        if input_asr == 'kyutai':
            started = time.monotonic()
            paired_text = await asr.recognize(pcm)
            paired_ms = round((time.monotonic() - started) * 1000)
        else:
            candidate = ROOT / '.cache/kyutai-crisp-research/kyutai-stt-1b-q4_k.gguf'
            executable = ROOT / '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
            paired_text, paired_ms = await asyncio.to_thread(asr.recognize_crisp, pcm + bytes(32000), executable, candidate, 'kyutai-stt', allow_empty=True)
    # A synthetic WAV exercises the same file-based input path requested by the operator.
    with tempfile.NamedTemporaryFile(prefix='voice-loopback-', suffix='.wav', dir=ROOT / '.cache', delete=False) as temp:
        filename = Path(temp.name)
    with net_socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
    env = dict(os.environ, ASSISTAI_GATEWAY_PORT=str(port), ASSISTAI_DB_PATH=':memory:',
               ASSISTAI_OPENCODE_URL='', ASSISTAI_LFM_REALTIME_URL='', ASSISTAI_BUDGET_SAMPLE_PATH='',
               ASSISTAI_RESOURCE_STATUS_PATH='', ASSISTAI_SHARED_RESERVATIONS_PATH='',
               ASSISTAI_ASR_URL='ws://127.0.0.1:18132/asr' if input_asr == 'kyutai' else 'ws://127.0.0.1:18082/asr', ASSISTAI_LLM_URL='http://127.0.0.1:18084/v1',
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
        first_audio_ms = None; final_asr_ms = None
        async with connect(f'ws://127.0.0.1:{port}/voice') as socket:
            while True:
                event = json.loads(await asyncio.wait_for(socket.recv(), 20))
                if event.get('type') == 'asr.ready': break
                if event.get('type') == 'error': raise RuntimeError(event.get('message'))
            turn_started = time.monotonic()
            await socket.send(json.dumps({'type':'audio.start'}))
            for offset in range(0, len(pcm), 3200):
                await socket.send(pcm[offset:offset + 3200]); await asyncio.sleep(.1)
            end_sent = time.monotonic()
            await socket.send(json.dumps({'type':'audio.end'}))
            while True:
                event = await asyncio.wait_for(socket.recv(), 90)
                if isinstance(event, bytes):
                    if first_audio_ms is None: first_audio_ms = round((time.monotonic() - end_sent) * 1000)
                    response.extend(event)
                    if len(response) > 4 * 1024 * 1024: raise RuntimeError('Audio exceeded probe limit')
                    continue
                event = json.loads(event); kind = event.get('type')
                if kind == 'user.text': transcript = event.get('text', ''); final_asr_ms = round((time.monotonic() - end_sent) * 1000)
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
        started = time.monotonic()
        if input_asr == 'kyutai':
            heard = await asr.recognize(converted)
        else:
            heard, _ = await asyncio.to_thread(asr.recognize_crisp, converted + bytes(32000), executable, candidate, 'kyutai-stt', allow_empty=True)
        elapsed = round((time.monotonic() - started) * 1000)
        answered = expected_answer_present(answer, expected)
        heard_answer = expected_answer_present(heard, expected)
        intent_ok = input_intent_preserved(transcript, scenario)
        answer_ok = straightforward_answer(answer, scenario)
        audio_ok = straightforward_answer(heard, scenario)
        print(json.dumps({'question':question, 'input_transcript':transcript, 'assistant_text':answer,
                          'output_asr':heard, 'normalized_wer':asr.word_error(answer, heard),
                          'input_engine':input_asr, 'paired_input_engine':('vosk' if input_asr == 'kyutai' else 'kyutai-file') if paired_input else None,
                          'paired_input_transcript':paired_text, 'paired_input_ms':paired_ms,
                          'paired_input_intent_preserved':input_intent_preserved(paired_text, scenario) if paired_input else None,
                          'output_engine':'vosk' if input_asr == 'kyutai' else 'kyutai',
                          'input_audio_ms':round(len(pcm) / 32), 'input_send_ms':round((end_sent - turn_started) * 1000),
                          'end_to_transcript_ms':final_asr_ms, 'end_to_first_audio_ms':first_audio_ms,
                          'expected_answer_in_text':answered, 'expected_answer_in_output_asr':heard_answer,
                          'input_intent_preserved':intent_ok, 'straightforward_text_answer':answer_ok,
                          'straightforward_output_asr':audio_ok,
                          'output_audio_bytes':len(response), 'output_sample_rate':sample_rate,
                          'output_asr_ms':elapsed, 'audio_synthetic':True,
                          'physical_devices_opened':False, 'audio_saved_after_run':False}, ensure_ascii=False), flush=True)
        if not (intent_ok and answer_ok and audio_ok):
            raise RuntimeError('Input or response did not match the probe’s conservative acceptance forms')
    finally:
        if child.poll() is None:
            child.terminate()
            try: child.wait(timeout=5)
            except subprocess.TimeoutExpired: child.kill(); child.wait(timeout=5)
        filename.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--scenario', choices=('math', 'capital'), default='math')
    parser.add_argument('--input-asr', choices=('vosk', 'kyutai'), default='vosk')
    parser.add_argument('--paired-input', action='store_true', help='Also transcribe the same synthetic input with the other recognizer')
    args = parser.parse_args()
    asyncio.run(main(args.scenario, args.input_asr, args.paired_input))
