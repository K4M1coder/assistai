"""Offline target-speaker diagnostic using separate public recordings."""
import asyncio
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import time

import numpy as np
import soundfile as sf
import soxr
from voxlock import VoxLock

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--threads', type=int, choices=(1, 2, 4), default=2)
parser.add_argument('--chunk-ms', type=int, choices=(20, 40, 80), default=20)
parser.add_argument('--target-only', action='store_true')
parser.add_argument('--paced', action='store_true')
parser.add_argument('--framer', action='store_true')
args = parser.parse_args()
if args.framer and args.chunk_ms != 40:
    parser.error('Framer comparison requires 40 ms chunks')
def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    item = importlib.util.module_from_spec(spec); spec.loader.exec_module(item)
    return item
probe = module('voxlock_probe', 'probe-voxlock.py')
metrics = module('correlation_probe', 'probe-browser-mixture-extraction.py')


def mls(name, expected):
    path = ROOT / '.cache/mls-sidon-natural' / name
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Unexpected MLS source hash')
    audio, rate = sf.read(str(path), dtype='float32')
    if audio.ndim != 1 or rate != 48000:
        raise ValueError('Unexpected MLS audio format')
    return soxr.resample(audio, rate, 16000)


async def main():
    enroll = mls('1406_1028_000000.flac', '8346625854eb7c3611febabf50747e1e315597c357390197740424f04c71c260')[:6*16000]
    target = mls('1406_1028_000001.flac', 'e769454a1922457df8580baf95ca2bfd4b0ffeb526f1ac61fa43c5ab77170431')[:7*16000]
    female, female_hash = probe.audio('fleurs-fr-118005971910520590.wav')
    if female_hash != '12e953bde5e4c50ef4280bbd94be79a810788c0494069389035bf928731eb5f7':
        raise ValueError('Unexpected FLEURS source hash')
    other_enroll, other = female[:48000], female[48000:48000+len(target)]
    if len(target) != len(other): raise ValueError('Competitor is too short')
    target_rms = np.sqrt(np.mean(target.astype(np.float64)**2))
    other_rms = np.sqrt(np.mean(other.astype(np.float64)**2))
    if min(target_rms, other_rms) < 1e-8: raise ValueError('Silent source')
    other = other * (target_rms / other_rms)
    scale = min(1.0, 0.95 / np.max(np.abs(target + other)))
    target *= scale; other *= scale; mixture = target + other
    model = VoxLock(model_dir=ROOT / '.cache/voxlock/onnx/v2', precision='int8', threads=args.threads)
    references = {'target': target, 'other': other}; results = {}
    for label, enrollment in [('target', enroll), ('other', other_enroll * 64)]:
        if args.target_only and label != 'target': continue
        if np.max(np.abs(enrollment)) >= 1: raise ValueError('Enrollment clips')
        stream = model.stream(enrollment)
        if args.framer:
            spec = importlib.util.spec_from_file_location('speaker_extraction', ROOT / 'prototype/speaker_extraction.py')
            extraction = importlib.util.module_from_spec(spec); spec.loader.exec_module(extraction)
            framer = extraction.ExtractionFramer(stream, batch_frames=2)
        extraction_started = datetime.now(timezone.utc).isoformat()
        started = time.perf_counter(); durations = []; end_to_end = []; chunks = []; chunk_samples = args.chunk_ms * 16
        for i in range(0, len(mixture), chunk_samples):
            available_at = started + min(i + chunk_samples, len(mixture)) / 16000
            if args.paced:
                delay = available_at - time.perf_counter()
                if delay > 0: time.sleep(delay)
            chunk_started = time.perf_counter()
            if args.framer:
                pcm = (np.clip(mixture[i:i+chunk_samples], -1, 32767/32768) * 32768).astype('<i2').tobytes()
                for j in range(0, len(pcm), 640):
                    if len(pcm[j:j+640]) != 640: raise ValueError('Incomplete frame')
                    chunks.extend(np.frombuffer(frame, dtype='<i2').astype(np.float32)/32768 for frame in framer.feed(pcm[j:j+640]))
            else:
                chunks.append(stream.push(mixture[i:i+chunk_samples]))
            durations.append((time.perf_counter()-chunk_started)*1000)
            if args.paced: end_to_end.append((time.perf_counter()-available_at)*1000)
        if not args.framer: chunks.append(stream.flush())
        output = np.concatenate(chunks)[:len(mixture)]
        emitted_samples = len(output)
        if len(output) < len(mixture): output = np.pad(output, (0, len(mixture)-len(output)))
        extraction_ended = datetime.now(timezone.utc).isoformat()
        results[label] = {'processing_seconds': round(time.perf_counter()-started, 3), 'transcript': await probe.recognize(output),
                          'emitted_samples_before_padding': emitted_samples,
                          'extraction_started_utc': extraction_started, 'extraction_ended_utc': extraction_ended,
                          'push_latency_ms': {'p50': round(float(np.percentile(durations, 50)), 2), 'p95': round(float(np.percentile(durations, 95)), 2), 'max': round(max(durations), 2)},
                          'availability_to_push_end_ms': ({'p50': round(float(np.percentile(end_to_end, 50)), 2), 'p95': round(float(np.percentile(end_to_end, 95)), 2), 'max': round(max(end_to_end), 2)} if args.paced else None),
                          'source_correlations': {key: metrics.peak_correlation(output, value) for key, value in references.items()}}
    print(json.dumps({'target_samples': len(target), 'mixture_sha256': hashlib.sha256(mixture.astype('<f4').tobytes()).hexdigest(),
                      'common_scale': float(scale), 'input_correlations': {key: metrics.peak_correlation(mixture, value) for key, value in references.items()},
                      'clean_target_transcript': await probe.recognize(target), 'mixture_transcript': await probe.recognize(mixture),
                      'threads': args.threads, 'chunk_ms': args.chunk_ms, 'target_only': args.target_only, 'paced': args.paced, 'framer': args.framer,
                      'results': results, 'physical_devices_opened': False}, ensure_ascii=False), flush=True)


asyncio.run(main())
