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
    def __init__(self, fixture):
        self.fixture = fixture
        self.offset = 0
        self.inject = Event()
        self.done = Event()

    def __getattr__(self, name): return getattr(sd, name)

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
    result = AggregateOutput()
    client.NativePlayback = CountingPlayback
    device = InjectingSoundDevice(load_fixture())
    sys.modules['sounddevice'] = device
    with redirect_stdout(result):
        task = asyncio.create_task(client.run(url, threshold=0.005))
        try:
            deadline = time.monotonic() + 15
            while not result.ready:
                if task.done(): await task
                if time.monotonic() > deadline: raise TimeoutError('Native client did not become ready')
                await asyncio.sleep(0.05)
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
    metrics = {'transcript_events':result.transcripts, 'synthetic_question_recognized':result.question_recognized,
               'assistant_response_events':result.responses, 'playback_nonzero_samples':playback.nonzero_samples if playback else 0,
               'client_errors':result.errors, 'saved_microphone_audio':False,
               'note':'Uncontrolled room audio; no transcript or response text printed by this probe.'}
    print(json.dumps(metrics))
    if not result.question_recognized or not result.responses or not playback or playback.nonzero_samples == 0 or result.errors:
        raise RuntimeError('Physical synthetic-question probe did not meet its checks')


if __name__ == '__main__': asyncio.run(main())
