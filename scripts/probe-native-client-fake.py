"""Exercise the Windows client with synthetic devices and a real local gateway."""
import asyncio
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import sys
from threading import Event, Thread
import time
from types import SimpleNamespace
import wave

import numpy as np

from prototype import native_audio_client as client

with wave.open(str(Path('.cache/reset-question.wav')), 'rb') as source:
    if source.getframerate() != 16000 or source.getnchannels() != 1 or source.getsampwidth() != 2:
        raise ValueError('Expected 16 kHz mono PCM16 fixture')
    audio = source.readframes(source.getnframes())
audio += bytes((-len(audio)) % 640) + bytes(640 * 60)
finished = Event()
streams = []
output_nonzero = 0
last_render = bytes(640)
quiet_output_frames = 0
simulate_echo = os.environ.get('ASSISTAI_TEST_ECHO') == '1'
simulate_manual = os.environ.get('ASSISTAI_TEST_MANUAL_INTERRUPT') == '1'
manual_requested = False
trace_echo = os.environ.get('ASSISTAI_TEST_AEC_TRACE') == '1'
echo_rms = []


if trace_echo:
    load_echo = client._load_echo_canceller

    def traced_echo():
        processor = load_echo()

        class Trace:
            @property
            def _failed(self): return processor._failed
            def render(self, data, timestamp): return processor.render(data, timestamp)
            def capture(self, data, timestamp):
                result = processor.capture(data, timestamp)
                if output_nonzero > 1000 and len(result) == len(data) and len(data):
                    raw = np.frombuffer(data, dtype='<i2').astype(np.float64) / 32768
                    clean = np.frombuffer(result, dtype='<i2').astype(np.float64) / 32768
                    echo_rms.append((float(np.sqrt(np.mean(raw * raw))), float(np.sqrt(np.mean(clean * clean)))))
                return result
        return Trace()

    client._load_echo_canceller = traced_echo


class FakeStream:
    def __init__(self, *, callback, is_input, **kwargs):
        self.callback, self.is_input = callback, is_input
        self.stopped, self.closed, self.offset = Event(), False, 0
        self.thread = None
        streams.append(self)

    @property
    def time(self): return time.monotonic()

    def start(self):
        self.thread = Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        global output_nonzero, last_render, quiet_output_frames
        while not self.stopped.is_set():
            now = time.monotonic()
            timing = SimpleNamespace(inputBufferAdcTime=now, outputBufferDacTime=now)
            if self.is_input:
                data = audio[self.offset:self.offset + 640]
                self.offset += len(data)
                self.callback(data if data else (last_render if simulate_echo else bytes(640)), 320, timing, None)
            else:
                data = bytearray(640)
                self.callback(data, 320, timing, None)
                last_render = bytes(data)
                nonzero = int(np.count_nonzero(np.frombuffer(data, dtype='<i2')))
                output_nonzero += nonzero
                quiet_output_frames = quiet_output_frames + 1 if nonzero == 0 and output_nonzero > 1000 else 0
                if output_nonzero > 1000 and ((not simulate_echo and not simulate_manual) or ((simulate_echo or simulate_manual) and quiet_output_frames >= 50)): finished.set()
            self.stopped.wait(0.02)

    def stop(self):
        self.stopped.set()
        if self.thread: self.thread.join(timeout=2)

    def close(self): self.closed = True


class FakeSoundDevice:
    CallbackAbort = RuntimeError
    @staticmethod
    def query_hostapis(): return [{'name':'Windows WASAPI','default_input_device':0,'default_output_device':1}]
    @staticmethod
    def WasapiSettings(**kwargs): return kwargs
    @staticmethod
    def RawInputStream(**kwargs): return FakeStream(is_input=True, **kwargs)
    @staticmethod
    def RawOutputStream(**kwargs): return FakeStream(is_input=False, **kwargs)


class FakeKeyboard:
    @staticmethod
    def kbhit(): return simulate_manual and output_nonzero > 1000 and not manual_requested
    @staticmethod
    def getwch():
        global manual_requested
        manual_requested = True
        return 'i'


async def main():
    sys.modules['sounddevice'] = FakeSoundDevice
    if simulate_manual:
        sys.modules['msvcrt'] = FakeKeyboard
        sys.stdin = SimpleNamespace(isatty=lambda:True)
    captured = io.StringIO()
    with redirect_stdout(captured):
        task = asyncio.create_task(client.run('ws://127.0.0.1:18088/voice', threshold=float(os.environ.get('ASSISTAI_TEST_THRESHOLD', '0.01')), aec=os.environ.get('ASSISTAI_TEST_AEC') == '1'))
        try:
            if not await asyncio.to_thread(finished.wait, 25): raise TimeoutError('No synthetic output')
            if task.done(): await task
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    messages = captured.getvalue()
    transcript_count = messages.count('"type": "user.text"')
    interruptions = messages.count('"type": "playback.interrupted"')
    interrupt_events = [json.loads(line) for line in messages.splitlines() if line.startswith('{') and '"type": "playback.interrupted"' in line]
    trace = {'frames':len(echo_rms), 'raw_rms_p95':round(float(np.percentile([x[0] for x in echo_rms],95)),4), 'clean_rms_p95':round(float(np.percentile([x[1] for x in echo_rms],95)),4), 'clean_frames_above_threshold':sum(x[1]>float(os.environ.get('ASSISTAI_TEST_THRESHOLD','0.01')) for x in echo_rms)} if echo_rms else None
    print(json.dumps({'input_streams':sum(s.is_input for s in streams),'output_streams':sum(not s.is_input for s in streams),'streams_closed':all(s.closed for s in streams),'user_transcript_observed':'quel est le mot secret' in messages.lower(),'transcript_count':transcript_count,'interruptions':interruptions,'interruption_elapsed_ms':[event.get('elapsed_ms') for event in interrupt_events],'simulated_echo':simulate_echo,'manual_interrupt_sent':manual_requested,'aec_trace':trace,'output_nonzero_samples':output_nonzero,'physical_devices_opened':False}))
    if not all(s.closed for s in streams) or 'quel est le mot secret' not in messages.lower() or output_nonzero <= 1000 or (simulate_echo and (transcript_count != 1 or interruptions)) or (simulate_manual and (not manual_requested or interruptions != 1)):
        raise RuntimeError('Synthetic device client probe failed')


if __name__ == '__main__': asyncio.run(main())
