"""Compare repeated synthetic utterances on one local persistent CPU model."""
import importlib.util
import argparse
import hashlib
import io
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import wave

import requests

ROOT = Path(__file__).resolve().parents[1]
EXECUTABLE = ROOT / '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
MODEL = ROOT / '.cache/kyutai-crisp-research/kyutai-stt-1b-q4_k.gguf'
SCENARIOS = {'math': 'Combien font deux plus trois ? Réponds en un mot.',
             'capital': 'Quelle est la capitale de la France ? Réponds en un mot.'}


def synthetic_wav(text):
    spec = importlib.util.spec_from_file_location('spoken_recall', ROOT / 'scripts/probe-spoken-session-recall.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    pcm = module.synthesize(text) + bytes(32000)
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000); output.writeframes(pcm)
    return buffer.getvalue()


def cold_transcribe(audio):
    spec = importlib.util.spec_from_file_location('asr_coding', ROOT / 'scripts/probe-asr-coding.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    with wave.open(io.BytesIO(audio), 'rb') as source:
        pcm = source.readframes(source.getnframes())
    return module.recognize_crisp(pcm, EXECUTABLE, MODEL, 'kyutai-stt', seed=42, no_fallback=True, allow_empty=True)


def rate_mismatch_control(audio):
    """Experimental short-clip control, not a valid general server workaround."""
    import numpy as np
    from scipy.signal import resample_poly
    with wave.open(io.BytesIO(audio), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 16000):
            raise ValueError('Expected mono 16-bit 16 kHz WAV')
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float64)
    converted = np.clip(np.rint(resample_poly(samples, 3, 2)), -32768, 32767).astype('<i2')
    result = io.BytesIO()
    with wave.open(result, 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000); output.writeframes(converted.tobytes())
    return result.getvalue()


def main():
    global EXECUTABLE
    parser = argparse.ArgumentParser()
    parser.add_argument('--executable', type=Path, default=EXECUTABLE)
    parser.add_argument('--fixed-synthetic-fixture', action='store_true')
    parser.add_argument('--natural-fixture', action='store_true')
    parser.add_argument('--scenario', choices=tuple(SCENARIOS), default='math')
    options = parser.parse_args()
    EXECUTABLE = options.executable.resolve()
    if not EXECUTABLE.is_file() or not MODEL.is_file(): raise RuntimeError('Pinned local files are missing')
    if options.natural_fixture and options.fixed_synthetic_fixture:
        raise ValueError('Choose a natural or synthetic fixture')
    fixture = ROOT / f'.cache/kyutai-persistent-synthetic-{options.scenario}.wav'
    reused = False
    if options.natural_fixture:
        natural = ROOT / '.cache/fleurs-fr-17559822372056259463.wav'
        raw = natural.read_bytes()
        if hashlib.sha256(raw).hexdigest() != 'ca0c712cd2098656ae5c35b5e515f8682356f44983814a2e1cf2d16beb1775cc':
            raise ValueError('Natural fixture hash mismatch')
        with wave.open(io.BytesIO(raw), 'rb') as source:
            if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 16000):
                raise ValueError('Expected mono PCM16 16 kHz natural fixture')
            pcm = source.readframes(source.getnframes()) + bytes(32000)
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(pcm)
        audio = output.getvalue()
    elif options.fixed_synthetic_fixture and fixture.is_file():
        audio = fixture.read_bytes(); reused = True
    else:
        audio = synthetic_wav(SCENARIOS[options.scenario])
        if options.fixed_synthetic_fixture:
            with fixture.open('xb') as output: output.write(audio)
    cold_text, cold_ms = cold_transcribe(audio)
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    args = [str(EXECUTABLE), '--server', '--backend', 'kyutai-stt', '-m', str(MODEL), '-ng', '-t', '2',
            '-l', 'fr', '-nt', '-np', '--lid-backend', 'off', '--no-punctuation', '--no-fallback', '--seed', '42',
            '--no-warmup', '--host', '127.0.0.1', '--port', str(port)]
    started = time.monotonic()
    diagnostics = tempfile.TemporaryFile(); succeeded = False
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=diagnostics,
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        deadline = time.monotonic() + 60
        while True:
            if process.poll() is not None: raise RuntimeError(f'ASR server exited: {process.returncode}')
            try:
                health = requests.get(base + '/health', timeout=1)
                if health.ok and health.json().get('status') == 'ok': break
            except requests.RequestException:
                pass
            if time.monotonic() >= deadline: raise TimeoutError('ASR server startup timed out')
            time.sleep(.2)
        startup_ms = round((time.monotonic() - started) * 1000)
        results = []
        for label, payload in [('original', audio), ('rate_mismatch_control', rate_mismatch_control(audio))]:
            beginning = time.monotonic()
            response = requests.post(base + '/v1/audio/transcriptions', files={'file':('synthetic.wav', payload, 'audio/wav')},
                                     data={'language':'fr', 'response_format':'json', 'seed':'42', 'temperature':'0'}, timeout=60)
            response.raise_for_status()
            text = response.json().get('text', '').strip()
            results.append({'condition':label, 'text':text, 'request_ms':round((time.monotonic() - beginning) * 1000)})
        print(json.dumps({'scenario':'fleurs-fr-17559822372056259463' if options.natural_fixture else options.scenario,
                          'startup_ms':startup_ms, 'audio_bytes':len(audio), 'cold_text':cold_text,
                          'cold_ms_including_load':cold_ms, 'runs':results,
                          'audio_sha256':hashlib.sha256(audio).hexdigest(), 'fixture_reused':reused,
                          'physical_devices_opened':False, 'synthetic':not reused and not options.natural_fixture,
                          'audio_saved_by_probe':options.fixed_synthetic_fixture}, ensure_ascii=False), flush=True)
        succeeded = True
    finally:
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
        if not succeeded:
            diagnostics.seek(0, 2); diagnostics.seek(max(0, diagnostics.tell() - 4000))
            print(diagnostics.read().decode('utf-8', errors='replace'), file=sys.stderr)
        diagnostics.close()


if __name__ == '__main__':
    main()
