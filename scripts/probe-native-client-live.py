"""Short opt-in WASAPI gateway probe; no microphone audio is saved."""
import asyncio
from contextlib import redirect_stdout
import json
import os
import sys
from threading import Event
import time
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener
import wave

import numpy as np
import sounddevice as sd

from prototype import native_audio_client as client
from prototype.native_playback import NativePlayback


class AggregateOutput:
    """Consume client logs without retaining transcript or response text."""
    def __init__(self):
        self.pending = ''
        self.ready = False
        self.transcripts = 0
        self.question_recognized = False
        self.responses = 0
        self.errors = 0

    def write(self, value):
        self.pending += value
        while '\n' in self.pending:
            line, self.pending = self.pending.split('\n', 1)
            if line.startswith('Listening locally.'): self.ready = True
            if not line.startswith('{'): continue
            try: event = json.loads(line)
            except json.JSONDecodeError: continue
            if event.get('type') == 'user.text':
                self.transcripts += 1
                text = event.get('text', '').lower()
                self.question_recognized |= 'mot' in text and 'secret' in text
            elif event.get('type') == 'assistant.text': self.responses += 1
            elif event.get('type') in ('error', 'task.error'): self.errors += 1
        if len(self.pending) > 10000: self.pending = ''
        return len(value)

    def flush(self): pass


class CountingPlayback(NativePlayback):
    instance = None
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.nonzero_samples = 0
        CountingPlayback.instance = self

    def read_frames(self, frames):
        data = super().read_frames(frames)
        self.nonzero_samples += int(np.count_nonzero(np.frombuffer(data, dtype='<i2')))
        return data


def load_fixture():
    with wave.open('.cache/reset-question.wav', 'rb') as source:
        if source.getframerate() != 16000 or source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError('Expected 16 kHz mono PCM16 synthetic question')
        data = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)
    peak = float(np.max(np.abs(data)))
    if peak == 0: raise ValueError('Synthetic question is silent')
    data = np.clip(data / peak * (0.08 * 32767), -32768, 32767).astype(np.int16)
    return data.tobytes()


class InjectingSoundDevice:
    """Inject test speech into the client's existing speaker stream only."""
    def __init__(self, fixture, threshold):
        self.fixture = fixture
        self.threshold = threshold
        self.offset = 0
        self.inject = Event()
        self.done = Event()
        self.levels = {phase:{'frames':0,'power_sum':0.0,'max_rms':0.0,'above_threshold':0,'run':0,'max_run':0} for phase in ('before', 'during', 'after')}

    def __getattr__(self, name): return getattr(sd, name)

    def RawInputStream(self, **kwargs):
        callback = kwargs['callback']
        def capture(indata, frames, timing, status):
            samples = np.frombuffer(indata, dtype='<i2').astype(np.float32) / 32768
            power = float(np.mean(samples * samples))
            phase = 'before' if not self.inject.is_set() else ('after' if self.done.is_set() else 'during')
            metrics = self.levels[phase]
            metrics['frames'] += 1; metrics['power_sum'] += power
            metrics['max_rms'] = max(metrics['max_rms'], power ** 0.5)
            above = power ** 0.5 > self.threshold
            metrics['above_threshold'] += int(above)
            metrics['run'] = metrics['run'] + 1 if above else 0
            metrics['max_run'] = max(metrics['max_run'], metrics['run'])
            callback(indata, frames, timing, status)
        kwargs['callback'] = capture
        return sd.RawInputStream(**kwargs)

    def RawOutputStream(self, **kwargs):
        callback = kwargs['callback']
        def output(outdata, frames, timing, status):
            callback(outdata, frames, timing, status)
            if self.inject.is_set() and not self.done.is_set():
                chunk = self.fixture[self.offset:self.offset + frames * 2]
                self.offset += len(chunk)
                outdata[:] = chunk + bytes(frames * 2 - len(chunk))
                if self.offset >= len(self.fixture): self.done.set()
        kwargs['callback'] = output
        return sd.RawOutputStream(**kwargs)


async def main():
    url = os.environ.get('ASSISTAI_TEST_VOICE_URL')
    if not url: raise ValueError('Set ASSISTAI_TEST_VOICE_URL to an isolated local gateway')
    address = urlsplit(url)
    if address.scheme != 'ws' or address.hostname not in ('127.0.0.1', 'localhost', '::1') or address.username is not None:
        raise ValueError('The physical probe requires a local loopback WebSocket URL')
    opener = build_opener(ProxyHandler({}))
    with opener.open(f'http://{address.netloc}/health', timeout=3) as response:
        health = json.load(response)
    if health.get('history_storage') != 'volatile':
        raise RuntimeError('The physical probe requires a gateway with ASSISTAI_DB_PATH=:memory:')
    threshold = float(os.environ.get('ASSISTAI_TEST_THRESHOLD', '0.005'))
    result = AggregateOutput()
    client.NativePlayback = CountingPlayback
    device = InjectingSoundDevice(load_fixture(), threshold)
    sys.modules['sounddevice'] = device
    with redirect_stdout(result):
        task = asyncio.create_task(client.run(url, threshold=threshold))
        try:
            deadline = time.monotonic() + 15
            while not result.ready:
                if task.done(): await task
                if time.monotonic() > deadline: raise TimeoutError('Native client did not become ready')
                await asyncio.sleep(0.05)
            await asyncio.sleep(1)
            device.inject.set()
            if not await asyncio.to_thread(device.done.wait, 8): raise TimeoutError('Synthetic speaker input did not complete')
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if task.done(): await task
                playback = CountingPlayback.instance
                if result.responses and playback and playback.nonzero_samples > 0 and not playback.active(): break
                await asyncio.sleep(0.05)
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    playback = CountingPlayback.instance
    levels = {phase:{'frames':v['frames'], 'rms':round((v['power_sum']/v['frames'])**0.5, 6) if v['frames'] else None,
                     'max_frame_rms':round(v['max_rms'], 6), 'above_threshold':v['above_threshold'], 'max_consecutive_above_threshold':v['max_run']} for phase,v in device.levels.items()}
    metrics = {'transcript_events':result.transcripts, 'synthetic_question_recognized':result.question_recognized,
               'assistant_response_events':result.responses, 'playback_nonzero_samples':playback.nonzero_samples if playback else 0,
               'client_errors':result.errors, 'threshold':threshold, 'capture_level_by_callback_phase':levels, 'saved_microphone_audio':False,
               'note':'Uncontrolled room audio; no transcript or response text printed by this probe.'}
    print(json.dumps(metrics))
    if not result.question_recognized or not result.responses or not playback or playback.nonzero_samples == 0 or result.errors:
        raise RuntimeError('Physical synthetic-question probe did not meet its checks')


if __name__ == '__main__': asyncio.run(main())
