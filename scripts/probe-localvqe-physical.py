"""Low-volume WASAPI echo probe; prints aggregates and does not save captured audio."""
import importlib.util
from contextlib import ExitStack
import argparse
import hashlib
import json
from pathlib import Path
from threading import Event, Lock
import time

import numpy as np
import sounddevice as sd
from scipy.signal import correlate, correlation_lags

from prototype.native_audio_client import _clock_offset
from prototype.reference_delay import estimate_delay
from prototype.native_turn import NativeTurnDetector

spec = importlib.util.spec_from_file_location('localvqe_probe', Path(__file__).with_name('probe-localvqe-synthetic.py'))
aec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aec)


def starts(samples):
    detector = NativeTurnDetector(threshold=.025)
    pcm = (np.clip(samples, -1, 32767 / 32768) * 32768).astype('<i2').tobytes()
    pcm += bytes((-len(pcm)) % 640)
    return sum(1 for offset in range(0, len(pcm), 640)
               for event in detector.feed(pcm[offset:offset + 640])
               if isinstance(event, dict) and event.get('type') == 'audio.start')


def reconstruct(frames, origin, total, *, per_callback=True):
    target = np.zeros(total, np.float32)
    base = round((frames[0][0] - origin) * aec.RATE)
    sequential = 0
    for timestamp, samples in frames:
        pos = round((timestamp - origin) * aec.RATE) if per_callback else base + sequential
        sequential += len(samples)
        src = max(0, -pos); dst = max(0, pos)
        count = min(len(samples) - src, total - dst)
        if count > 0: target[dst:dst + count] = samples[src:src + count].astype(np.float32) / 32768
    return target


def main(output_peak=.04):
    if not 0 < output_peak <= .08:
        raise ValueError('Output peak must be greater than zero and at most 0.08')
    if hashlib.sha256(aec.MODEL.read_bytes()).hexdigest() != aec.EXPECTED:
        raise RuntimeError('Unexpected LocalVQE model digest')
    lib = aec.library()
    context = aec.context(lib)
    lib.localvqe_free(context)
    host = next((api for api in sd.query_hostapis() if api['name'] == 'Windows WASAPI'), None)
    if not host or host['default_input_device'] < 0 or host['default_output_device'] < 0:
        raise RuntimeError('Default Windows WASAPI input and output devices are required')
    fixture = aec.load_fixture()
    peak = float(np.max(np.abs(fixture)))
    if not peak: raise ValueError('Synthetic fixture is silent')
    total = 9 * aec.RATE
    played = np.zeros(total, np.float32)
    played[:8 * aec.RATE] = np.resize(fixture / peak * output_peak, 8 * aec.RATE)
    capture, render, failures = [], [], []
    done, lock = Event(), Lock()
    clocks = {'input': 0.0, 'output': 0.0}
    state = {'out': 0, 'in': 0}

    def fail(message):
        with lock: failures.append(message)
        done.set()

    def out_callback(outdata, frames, timing, status):
        try:
            if status: raise RuntimeError(f'Output error: {status}')
            start = state['out']
            segment = np.zeros(frames, dtype='<i2')
            available = played[start:start + frames]
            segment[:len(available)] = np.clip(available * 32768, -32768, 32767).astype('<i2')
            outdata[:] = segment.tobytes()
            with lock:
                if start < total: render.append((timing.outputBufferDacTime + clocks['output'], segment.copy()))
                state['out'] += frames
        except Exception as error:
            fail(str(error)); raise sd.CallbackAbort from error

    def in_callback(indata, frames, timing, status):
        try:
            if status: raise RuntimeError(f'Input error: {status}')
            with lock:
                if state['in'] < total:
                    capture.append((timing.inputBufferAdcTime + clocks['input'], np.frombuffer(bytes(indata), dtype='<i2').copy()))
                    state['in'] += frames
                if state['in'] >= total: done.set()
        except Exception as error:
            fail(str(error)); raise sd.CallbackAbort from error

    options = {'extra_settings': sd.WasapiSettings(auto_convert=True)}
    print('Playing a quiet synthetic sample and measuring microphone levels for nine seconds.', flush=True)
    with ExitStack() as stack:
        ins = sd.RawInputStream(samplerate=aec.RATE, channels=1, dtype='int16', blocksize=320,
                                device=host['default_input_device'], callback=in_callback, **options)
        stack.callback(ins.close)
        outs = sd.RawOutputStream(samplerate=aec.RATE, channels=1, dtype='int16', blocksize=320,
                                 device=host['default_output_device'], callback=out_callback, **options)
        stack.callback(outs.close)
        clocks['input'], clocks['output'] = _clock_offset(ins), _clock_offset(outs)
        ins.start(); stack.callback(ins.stop)
        outs.start(); stack.callback(outs.stop)
        if not done.wait(15): raise TimeoutError('Physical probe timed out')
    if failures: raise RuntimeError(failures[0])
    if not capture or not render: raise RuntimeError('Missing device data')
    # Map each callback independently onto the capture clock; gaps stay zero.
    first = capture[0][0]
    mic = reconstruct(capture, first, total)
    ref = reconstruct(render, first, total)
    delay = estimate_delay(ref[:7 * aec.RATE], mic[:7 * aec.RATE])
    continuous_mic = reconstruct(capture, first, total, per_callback=False)
    continuous_ref = reconstruct(render, first, total, per_callback=False)
    continuous_delay = estimate_delay(continuous_ref[:7 * aec.RATE], continuous_mic[:7 * aec.RATE])
    calibration_mic, calibration_ref = mic[:7 * aec.RATE], ref[:7 * aec.RATE]
    cross = correlate(calibration_mic, calibration_ref, mode='full', method='fft')
    lags = correlation_lags(len(calibration_mic), len(calibration_ref), mode='full')
    selected = np.abs(lags) <= aec.RATE
    signed_lags, scores = lags[selected], np.abs(cross[selected])
    strongest = int(np.argmax(scores))
    signed_lag_ms = float(signed_lags[strongest] * 1000 / aec.RATE)
    signed_correlation = float(scores[strongest] / (np.linalg.norm(calibration_mic) * np.linalg.norm(calibration_ref) + 1e-12))

    def timing_stats(frames):
        first_timestamp = frames[0][0]
        total_samples = 0
        deviations = []
        for timestamp, data in frames:
            deviations.append((timestamp - first_timestamp - total_samples / aec.RATE) * 1000)
            total_samples += len(data)
        return {'callback_count': len(frames), 'offset_p95_abs_ms': round(float(np.percentile(np.abs(deviations), 95)), 3),
                'last_offset_ms': round(deviations[-1], 3)}
    offset = delay['delay_samples'] if delay['accepted'] else 0
    aligned = np.zeros_like(ref)
    if offset: aligned[offset:] = ref[:-offset]
    else: aligned[:] = ref
    length = (len(mic) // aec.HOP) * aec.HOP
    cleaned, times = aec.run(lib, mic[:length], aligned[:length])
    span = slice(2 * aec.RATE, 7 * aec.RATE)
    print(json.dumps({'duration_seconds': 9, 'output_peak_fraction': output_peak,
                      'calibration_accepted': delay['accepted'],
                      'estimated_delay_ms': round(offset * 1000 / aec.RATE, 2) if delay['accepted'] else None,
                      'correlation': round(delay['correlation'], 3), 'peak_ratio': round(delay['peak_ratio'], 3),
                      'continuous_calibration_accepted': continuous_delay['accepted'],
                      'continuous_delay_ms': round(continuous_delay['delay_samples'] * 1000 / aec.RATE, 2) if continuous_delay['accepted'] else None,
                      'continuous_correlation': round(continuous_delay['correlation'], 3),
                      'continuous_peak_ratio': round(continuous_delay['peak_ratio'], 3),
                      'signed_peak_lag_ms': round(signed_lag_ms, 2), 'signed_peak_correlation': round(signed_correlation, 3),
                      'input_timing': timing_stats(capture), 'output_timing': timing_stats(render),
                      'raw_rms': round(float(np.sqrt(np.mean(mic[span] ** 2))), 6),
                      'clean_rms': round(float(np.sqrt(np.mean(cleaned[span] ** 2))), 6),
                      'raw_turn_starts': starts(mic[span]), 'clean_turn_starts': starts(cleaned[span]),
                      'processing_hop_p95_ms': round(float(np.percentile(times, 95)), 3),
                      'saved_microphone_audio': False,
                      'note': 'Uncontrolled room and aggregate levels; not isolated echo attenuation or a live interruption test.'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--peak', type=float, default=.04, help='Playback peak fraction; maximum 0.08')
    main(parser.parse_args().peak)
