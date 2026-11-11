"""Measure a pinned LocalVQE build on synthetic audio; never opens audio devices."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
import wave

import numpy as np
from scipy.signal import correlate, correlation_lags, resample_poly

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / '.cache/localvqe-research/build/bin'
MODEL = ROOT / '.cache/localvqe-weights/localvqe-v1.4-aec-200K-f32.gguf'
EXPECTED = 'b6e43138588a83bfe903ab5e143b4020b91c1e1629f5a575ac5855ff0003c731'
RATE, HOP = 16000, 256


def load_fixture():
    with wave.open(str(ROOT / '.cache/french-test.wav'), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 24000):
            raise ValueError('Expected 24 kHz mono PCM16 synthetic fixture')
        raw = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768
    return resample_poly(raw, 2, 3).astype(np.float32)


def library():
    directories = [os.add_dll_directory(str(BIN))]
    gcc = shutil.which('gcc')
    if gcc: directories.append(os.add_dll_directory(str(Path(gcc).parent)))
    candidates = [BIN / 'localvqe.dll', BIN / 'liblocalvqe.dll']
    path = next((item for item in candidates if item.is_file()), None)
    if path is None: raise RuntimeError('LocalVQE DLL not found; build localvqe_shared first')
    lib = ctypes.CDLL(str(path))
    lib._research_dll_directories = directories
    handle = ctypes.c_size_t
    ptr = ctypes.POINTER(ctypes.c_float)
    lib.localvqe_options_new.restype = handle
    lib.localvqe_options_set_model_path.argtypes = [handle, ctypes.c_char_p]
    lib.localvqe_options_set_threads.argtypes = [handle, ctypes.c_int]
    lib.localvqe_new_with_options.argtypes = [handle]
    lib.localvqe_new_with_options.restype = handle
    lib.localvqe_options_free.argtypes = [handle]
    lib.localvqe_free.argtypes = [handle]
    lib.localvqe_process_frame_f32.argtypes = [handle, ptr, ptr, ctypes.c_int, ptr]
    lib.localvqe_process_frame_f32.restype = ctypes.c_int
    return lib


def context(lib):
    opts = lib.localvqe_options_new()
    if not opts: raise RuntimeError('Could not create options')
    try:
        if lib.localvqe_options_set_model_path(opts, os.fsencode(MODEL)) or lib.localvqe_options_set_threads(opts, 1):
            raise RuntimeError('Invalid LocalVQE options')
        ctx = lib.localvqe_new_with_options(opts)
        if not ctx: raise RuntimeError('Could not load LocalVQE model')
        return ctx
    finally:
        lib.localvqe_options_free(opts)


def run(lib, mic, ref):
    ctx = context(lib)
    output = np.zeros_like(mic)
    times = []
    try:
        for i in range(0, len(mic), HOP):
            a, b = mic[i:i + HOP], ref[i:i + HOP]
            out = np.zeros(HOP, np.float32)
            start = time.perf_counter()
            result = lib.localvqe_process_frame_f32(ctx, a.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
                                                    b.ctypes.data_as(ctypes.POINTER(ctypes.c_float)), HOP,
                                                    out.ctypes.data_as(ctypes.POINTER(ctypes.c_float)))
            times.append((time.perf_counter() - start) * 1000)
            if result: raise RuntimeError(f'LocalVQE processing failed: {result}')
            output[i:i + HOP] = out
    finally:
        lib.localvqe_free(ctx)
    return output, times


def main():
    if hashlib.sha256(MODEL.read_bytes()).hexdigest() != EXPECTED: raise RuntimeError('Unexpected model digest')
    fixture = load_fixture()
    count = (12 * RATE // HOP) * HOP
    played = np.resize(fixture, count).astype(np.float32)
    delay = int(0.15 * RATE)
    echo = np.zeros(count, np.float32)
    echo[delay:] = 0.3 * played[:-delay]
    near = np.zeros(count, np.float32)
    near[6 * RATE:8 * RATE] = np.resize(fixture[::-1], 2 * RATE)
    lib = library()
    cases = []
    for name, mic, ref in [('echo', echo, played), ('overlap', np.clip(echo + near, -1, 1), played),
                           ('near_only', near, np.zeros(count, np.float32))]:
        clean, times = run(lib, np.ascontiguousarray(mic), np.ascontiguousarray(ref))
        if not np.isfinite(clean).all(): raise RuntimeError('Non-finite output')
        result = {'mode': name, 'hop_p50_ms': round(float(np.percentile(times, 50)), 3),
                  'hop_p95_ms': round(float(np.percentile(times, 95)), 3), 'wall_ms': round(sum(times), 1)}
        if name == 'echo':
            tail = slice(8 * RATE, count)
            result['echo_reduction_db'] = round(float(10 * np.log10(np.mean(echo[tail] ** 2) / (np.mean(clean[tail] ** 2) + 1e-12))), 2)
        else:
            actual, expected = clean[6 * RATE:8 * RATE], near[6 * RATE:8 * RATE]
            scores = correlate(actual, expected, method='fft')
            lags = correlation_lags(len(actual), len(expected))
            result['near_correlation'] = round(float(scores[np.abs(lags) < RATE // 10].max() / (np.linalg.norm(actual) * np.linalg.norm(expected) + 1e-12)), 3)
            result['near_norm_ratio'] = round(float(np.linalg.norm(actual) / (np.linalg.norm(expected) + 1e-12)), 3)
        cases.append(result)
    fixture_hash = hashlib.sha256((ROOT / '.cache/french-test.wav').read_bytes()).hexdigest()
    print(json.dumps({'model_sha256': EXPECTED, 'fixture_sha256': fixture_hash, 'sample_rate': RATE, 'hop': HOP, 'threads': 1,
                      'delay_ms': 150, 'cases': cases, 'note': 'Synthetic offline replay; not a real-room or live interruption test.'}))


if __name__ == '__main__':
    main()
