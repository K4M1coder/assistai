"""Initialize the pinned VoxLock graphs with DirectML and no CPU fallback."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import time
import wave

import numpy as np
import onnxruntime as ort

root = Path(__file__).resolve().parents[1] / '.cache/voxlock/onnx/v2'
parser = argparse.ArgumentParser(); parser.add_argument('--precision', choices=('int8', 'fp16'), default='int8'); parser.add_argument('--audio', action='store_true')
args = parser.parse_args()
models = ([('enroll.onnx', '81f305c9b7a32f13d1401f53bb4c6301826a607c9e807e60912f36ef1b9fae29'),
           ('chunk_int8.onnx', 'c50ffdc8d723fd4f91cb08889f3d0143491f95967b705f35c444a0b4afe88172')] if args.precision == 'int8' else
          [('enroll_fp16.onnx', '96515a725cf0466450a41c565887a07e8c0fb0c89f6bbfbc01214433029a2f6c'),
           ('chunk_fp16.onnx', 'c4850d3bff7cacfed360ef4708a448ced1b6bf0eb43aff06e764099c9db02e3b')])
sessions = []
for name, expected in models:
    path = root / name
    with path.open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != expected:
            raise ValueError(f'Unexpected model hash: {name}')
    options = ort.SessionOptions()
    options.enable_mem_pattern = False
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.add_session_config_entry('session.disable_cpu_ep_fallback', '1')
    started = time.monotonic()
    try:
        session = ort.InferenceSession(str(path), sess_options=options, providers=[('DmlExecutionProvider', {'device_id': 0})])
    except Exception as error:
        print(json.dumps({'model': name, 'loaded': False, 'elapsed_seconds': round(time.monotonic()-started, 3),
                          'error': str(error), 'runtime': ort.__version__}), flush=True)
        raise
    sessions.append(session)
    print(json.dumps({'model': name, 'loaded': True, 'elapsed_seconds': round(time.monotonic()-started, 3),
                      'providers': session.get_providers(), 'runtime': ort.__version__, 'inference_performed': False}), flush=True)

if args.audio:
    repo = Path(__file__).resolve().parents[1]
    def read_fixture(name, expected):
        path = repo / '.cache/mls-sidon-natural' / name
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected: raise ValueError('Unexpected audio hash')
        with wave.open(str(path), 'rb') as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000): raise ValueError('Unexpected audio format')
            return np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768
    enrollment = read_fixture('native-enrollment-16k.wav', '5c8a2ad15dcd29e42fbb68875a042dc7906aa84642f540e67974c60d35a0ead0')
    mixture = read_fixture('native-mixture-16k.wav', '10fd59e283266f4060faccea05dcaa622e5d2e1a384dc582a39411da64511aaf')[32000:144000]
    spec = importlib.util.spec_from_file_location('voxlock_research_core', repo / '.venv-voice/Lib/site-packages/voxlock/core.py')
    core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
    model = core.VoxLock.__new__(core.VoxLock)
    model.enroll, model.chunk = sessions
    model.state = tuple({item.name: item.shape for item in model.chunk.get_inputs()}['h'])
    started = time.perf_counter(); stream = model.stream(enrollment); enrollment_seconds = time.perf_counter() - started
    chunks, timings = [], []
    for offset in range(0, len(mixture), 640):
        started = time.perf_counter(); chunks.append(stream.push(mixture[offset:offset + 640])); timings.append(time.perf_counter() - started)
    chunks.append(stream.flush()); output = np.concatenate(chunks)[:len(mixture)]
    if len(output) != len(mixture) or not np.isfinite(output).all(): raise ValueError('Invalid output')
    print(json.dumps({'inference_performed': True, 'audio_seconds':len(mixture)/16000, 'enrollment_seconds':round(enrollment_seconds,3),
                      'push_median_ms':round(float(np.median(timings))*1000,2), 'push_p95_ms':round(float(np.percentile(timings,95))*1000,2),
                      'output_rms':round(float(np.sqrt(np.mean(output.astype(np.float64)**2))),6), 'output_samples':len(output),
                      'physical_devices_opened':False}), flush=True)
