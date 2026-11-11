"""Short, low-volume local AEC probe; retains aggregate levels only, no audio files."""
import json
from queue import Queue
from threading import Event, Lock
import time
import wave

import numpy as np
import sounddevice as sd
import soxr

from prototype.native_audio_client import _clock_offset, _load_echo_canceller


def main():
    host = next((api for api in sd.query_hostapis() if api['name'] == 'Windows WASAPI'), None)
    if not host or host['default_input_device'] < 0 or host['default_output_device'] < 0:
        raise RuntimeError('Default Windows WASAPI input and output devices are required')
    with wave.open('.cache/french-test.wav', 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != 24000:
            raise ValueError('Expected 24 kHz mono PCM16 synthetic fixture')
        fixture = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)
    fixture = soxr.resample(fixture, 24000, 16000)
    peak = float(np.max(np.abs(fixture)))
    if peak == 0: raise ValueError('Synthetic fixture is silent')
    fixture = np.clip(fixture / peak * (0.08 * 32767), -32768, 32767).astype('<i2')
    playback = np.tile(fixture, int(np.ceil(8 * 16000 / len(fixture))))[:8 * 16000]
    echo = _load_echo_canceller()
    done, failed = Event(), Queue()
    lock = Lock()
    state = {'output_frames':0, 'measured_frames':0, 'raw_energy':0.0, 'clean_energy':0.0,
             'raw_above_0025':0, 'clean_above_0025':0, 'clean_run':0, 'max_clean_run':0}
    clocks = {'input':0.0, 'output':0.0}

    def out_callback(outdata, frames, timing, status):
        try:
            if status: raise RuntimeError(f'Output device status: {status}')
            start = state['output_frames']
            segment = playback[start:start + frames]
            padded = np.zeros(frames, dtype='<i2')
            padded[:len(segment)] = segment
            data = padded.tobytes()
            outdata[:] = data
            echo.render(data, timing.outputBufferDacTime + clocks['output'])
            with lock: state['output_frames'] += frames
            if start + frames >= len(playback): done.set()
        except Exception as error:
            failed.put(str(error)); done.set(); raise sd.CallbackAbort from error

    def in_callback(indata, frames, timing, status):
        try:
            if status: raise RuntimeError(f'Input device status: {status}')
            data = bytes(indata)
            cleaned = echo.capture(data, timing.inputBufferAdcTime + clocks['input'])
            if echo._failed: raise RuntimeError('AEC processing failed')
            if not cleaned: return
            if len(cleaned) != len(data): raise RuntimeError('Unexpected capture length')
            raw = np.frombuffer(data, dtype='<i2').astype(np.float64) / 32768
            filtered = np.frombuffer(cleaned, dtype='<i2').astype(np.float64) / 32768
            with lock:
                if 2 * 16000 <= state['output_frames'] < 7 * 16000:
                    state['measured_frames'] += 1
                    raw_power, clean_power = float(np.mean(raw * raw)), float(np.mean(filtered * filtered))
                    state['raw_energy'] += raw_power; state['clean_energy'] += clean_power
                    state['raw_above_0025'] += int(raw_power ** 0.5 > 0.025)
                    above = clean_power ** 0.5 > 0.025
                    state['clean_above_0025'] += int(above)
                    state['clean_run'] = state['clean_run'] + 1 if above else 0
                    state['max_clean_run'] = max(state['max_clean_run'], state['clean_run'])
        except Exception as error:
            failed.put(str(error)); done.set(); raise sd.CallbackAbort from error

    options = {'extra_settings':sd.WasapiSettings(auto_convert=True)}
    input_stream = sd.RawInputStream(samplerate=16000, channels=1, dtype='int16', blocksize=320,
        device=host['default_input_device'], callback=in_callback, **options)
    try:
        output_stream = sd.RawOutputStream(samplerate=16000, channels=1, dtype='int16', blocksize=320,
            device=host['default_output_device'], callback=out_callback, **options)
        try:
            clocks['input'], clocks['output'] = _clock_offset(input_stream), _clock_offset(output_stream)
            input_stream.start(); output_stream.start()
            if not done.wait(15): raise TimeoutError('Physical audio probe timed out')
        finally:
            output_stream.stop(); output_stream.close()
    finally:
        input_stream.stop(); input_stream.close()
    if not failed.empty(): raise RuntimeError(failed.get())
    n = state['measured_frames']
    if not n: raise RuntimeError('No usable capture frames')
    print(json.dumps({'duration_seconds':8, 'output_peak_fraction':0.08, 'capture_frames':n,
        'raw_rms':round((state['raw_energy']/n)**0.5, 6), 'clean_rms':round((state['clean_energy']/n)**0.5, 6),
        'raw_frames_above_0025':state['raw_above_0025'], 'clean_frames_above_0025':state['clean_above_0025'],
        'max_consecutive_clean_frames_above_0025':state['max_clean_run'],
        'saved_microphone_audio':False, 'note':'Total captured level may include other room audio; not an echo attenuation measurement.'}))


if __name__ == '__main__': main()
