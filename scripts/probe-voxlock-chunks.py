"""Measure CPU extractor chunk latency on a synthetic two-speaker mixture."""
import ctypes
from ctypes import wintypes
import hashlib
import json
from math import gcd
from pathlib import Path
import time
import wave

import numpy as np
from scipy.signal import resample_poly
from voxlock import VoxLock


class MemoryCounters(ctypes.Structure):
    _fields_ = [('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong),
                ('PeakWorkingSetSize',ctypes.c_size_t),('WorkingSetSize',ctypes.c_size_t),
                ('QuotaPeakPagedPoolUsage',ctypes.c_size_t),('QuotaPagedPoolUsage',ctypes.c_size_t),
                ('QuotaPeakNonPagedPoolUsage',ctypes.c_size_t),('QuotaNonPagedPoolUsage',ctypes.c_size_t),
                ('PagefileUsage',ctypes.c_size_t),('PeakPagefileUsage',ctypes.c_size_t)]


def memory():
    counters = MemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = (wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD)
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        raise ctypes.WinError(ctypes.get_last_error())
    return {'working_set_bytes':counters.WorkingSetSize, 'peak_working_set_bytes':counters.PeakWorkingSetSize,
            'private_commit_bytes':counters.PagefileUsage}


def load(path):
    with wave.open(str(path), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2: raise ValueError('Expected mono PCM16')
        rate = source.getframerate()
        signal = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768
    factor = gcd(rate, 16000)
    return resample_poly(signal, 16000 // factor, rate // factor).astype(np.float32)


def main():
    paths = {name:Path('.cache') / filename for name,filename in [('target','tse-target.wav'),('other','tse-interferer.wav'),('enrollment','tse-enroll.wav')]}
    target, other, enrollment = (load(paths[name]) for name in ('target','other','enrollment'))
    length = max(len(target), len(other))
    target = np.pad(target, (0, length-len(target))); other = np.pad(other, (0, length-len(other)))
    other *= np.sqrt(np.mean(target ** 2) / max(np.mean(other ** 2), 1e-12))
    mixture = target + other
    mixture *= min(1, 0.99 / np.max(np.abs(mixture)))
    before = memory(); start = time.perf_counter()
    model = VoxLock(model_dir=Path('.cache/voxlock/onnx/v2'), precision='int8', threads=1)
    load_ms = (time.perf_counter()-start)*1000
    start = time.perf_counter(); stream = model.stream(enrollment); enrollment_ms = (time.perf_counter()-start)*1000
    chunk_times = []; lag = 0.0; lags = []
    started_at = time.time(); wall_start = time.perf_counter(); cpu_start = time.process_time(); output_samples = 0
    for offset in range(0, len(mixture), 640):
        chunk = mixture[offset:offset+640]
        start = time.perf_counter(); result = stream.push(chunk); elapsed = (time.perf_counter()-start)*1000
        output_samples += len(result); chunk_times.append(elapsed)
        lag = max(0.0, lag + elapsed - len(chunk)/16); lags.append(lag)
    start=time.perf_counter(); tail=stream.flush(); flush_ms=(time.perf_counter()-start)*1000; output_samples += len(tail)
    wall = time.perf_counter()-wall_start; cpu = time.process_time()-cpu_start
    print(json.dumps({'started_unix':started_at,'audio_ms':round(length/16),'chunks':len(chunk_times),
        'model_load_ms':round(load_ms,2),'enrollment_ms':round(enrollment_ms,2),'wall_ms':round(wall*1000,2),
        'cpu_ms':round(cpu*1000,2),'rtf':round(wall/(length/16000),3),'chunk_ms_p50':round(float(np.percentile(chunk_times,50)),2),
        'chunk_ms_p95':round(float(np.percentile(chunk_times,95)),2),'chunk_ms_p99':round(float(np.percentile(chunk_times,99)),2),
        'chunk_ms_max':round(max(chunk_times),2),'simulated_lag_ms_p95':round(float(np.percentile(lags,95)),2),
        'simulated_lag_ms_max':round(max(lags),2),'flush_ms':round(flush_ms,2),'output_samples':output_samples,
        'memory_before':before,'memory_after':memory(),
        'fixture_sha256':{name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in paths.items()},
        'note':'Synthetic offline chunk replay; lag is simulated, not a live microphone measurement.'}))


if __name__ == '__main__': main()
