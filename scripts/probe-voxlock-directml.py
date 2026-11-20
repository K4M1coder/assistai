"""Initialize the pinned VoxLock graphs with DirectML and no CPU fallback."""
import argparse
import hashlib
import json
from pathlib import Path
import time

import onnxruntime as ort

root = Path(__file__).resolve().parents[1] / '.cache/voxlock/onnx/v2'
parser = argparse.ArgumentParser(); parser.add_argument('--precision', choices=('int8', 'fp16'), default='int8')
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
