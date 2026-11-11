"""Experimental loopback native audio client; device access starts only on run."""
import argparse
import asyncio
from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
from queue import Empty, Queue
import sys
import subprocess
from threading import Event
import time
from urllib.parse import urlsplit
import wave

import numpy as np
from websockets.asyncio.client import connect

from prototype.native_playback import NativePlayback
from prototype.native_turn import NativeTurnDetector
from prototype.speaker_extraction import ExtractionFramer, ExtractionWorker


def _load_speaker_extractor(enrollment_path):
    """Load an explicitly supplied local 16 kHz mono PCM16 enrollment file."""
    with wave.open(str(enrollment_path), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 16000):
            raise ValueError('Speaker enrollment must be mono 16 kHz PCM16 WAV')
        if not 3 * 16000 <= source.getnframes() <= 30 * 16000:
            raise ValueError('Speaker enrollment must be between 3 and 30 seconds')
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768
    from voxlock import VoxLock
    model = VoxLock(model_dir=Path('.cache/voxlock/onnx/v2'), precision='int8', threads=2)
    return lambda: ExtractionWorker(ExtractionFramer(model.stream(samples)))


def _clock_offset(stream):
    readings = []
    for _ in range(5):
        before = time.monotonic()
        stream_time = stream.time
        after = time.monotonic()
        readings.append((after - before, (before + after) / 2 - stream_time))
    return min(readings)[1]


def _load_echo_canceller():
    """Load the separately installed research comparator, not a bundled dependency."""
    path = Path('.cache/hf-speech-research/src/speech_to_speech/api/openai_realtime/echo_canceller.py')
    if not path.is_file():
        raise RuntimeError('The pinned speech-to-speech research source is missing; see the prototype README')
    revision = subprocess.check_output(['git', '-C', '.cache/hf-speech-research', 'rev-parse', 'HEAD'], text=True).strip()
    if revision != 'ebc09bf286edbe8739a59575709070f056d31e29':
        raise RuntimeError('Unexpected speech-to-speech research revision')
    subprocess.run(['git', '-C', '.cache/hf-speech-research', 'diff', '--quiet', 'HEAD', '--', 'src/speech_to_speech/api/openai_realtime/echo_canceller.py'], check=True)
    spec = importlib.util.spec_from_file_location('research_echo_canceller', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.EchoCanceller(16000, 16000)


async def _keyboard_action(key, playback, detector, socket, speech_detector=None):
    if key.lower() == 'i':
        playback.interrupt()
        detector.reset()
        if speech_detector is not None: speech_detector.reset()
        await socket.send(json.dumps({'type':'interrupt', 'reason':'manual'}))
        print(json.dumps({'type':'playback.interrupted', 'reason':'manual'}), flush=True)
        return 'interrupt'
    if key.lower() == 'q':
        return 'quit'
    return None


async def run(url, *, threshold=0.025, aec=False, vad='energy', vad_model='.cache/silero-vad-research/silero_vad/data/silero_vad.onnx', speaker_enrollment=None):
    address = urlsplit(url)
    if address.scheme != 'ws' or address.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise ValueError('The experimental client accepts only local loopback WebSocket URLs')
    if speaker_enrollment is not None and aec:
        raise ValueError('Experimental speaker extraction requires speaker-safe mode')
    import sounddevice as sd

    if sys.platform != 'win32':
        raise RuntimeError('The native client currently supports Windows WASAPI only')
    host = next((item for item in sd.query_hostapis() if item['name'] == 'Windows WASAPI'), None)
    if host is None or host['default_input_device'] < 0 or host['default_output_device'] < 0:
        raise RuntimeError('Default WASAPI input and output devices are required')
    echo = _load_echo_canceller() if aec else None
    extractor_factory = await asyncio.to_thread(_load_speaker_extractor, speaker_enrollment) if speaker_enrollment is not None else None
    detector, playback = NativeTurnDetector(threshold=threshold), NativePlayback()
    if vad not in ('energy', 'silero'): raise ValueError('Unsupported voice detector')
    if vad == 'silero':
        from prototype.silero_vad import SileroSpeechDetector
        speech_detector = SileroSpeechDetector(vad_model)
    else:
        speech_detector = None
    capture = Queue(maxsize=50)
    failure = Event()
    failure_message = []
    clocks = {'input': 0.0, 'output': 0.0}
    generation = None
    playback_started = 0.0
    audio_epoch = 0

    def fail(message):
        if not failure.is_set(): failure_message.append(message)
        failure.set()

    def output_callback(outdata, frames, timing, status):
        try:
            audio = playback.read_frames(frames)
            outdata[:] = audio
            if echo is not None:
                echo.render(audio, timing.outputBufferDacTime + clocks['output'])
            if status: fail(f'Output stream error: {status}')
        except Exception as error:
            fail(f'Output processing error: {error}')
            raise sd.CallbackAbort from error

    def input_callback(indata, frames, timing, status):
        try:
            if status: raise RuntimeError(f'Input stream error: {status}')
            data = bytes(indata)
            if echo is not None:
                data = echo.capture(data, timing.inputBufferAdcTime + clocks['input'])
                if echo._failed: raise RuntimeError('Echo processing failed')
            if data:
                if len(data) != 640: raise RuntimeError('Unexpected input frame size')
                capture.put_nowait((audio_epoch, playback.active(), data) if extractor_factory else data)
        except Exception as error:
            fail(f'Input processing error: {error}')
            raise sd.CallbackAbort from error

    async with connect(url, max_queue=8, max_size=2 * 1024 * 1024) as socket:
        # Do not open a microphone before the gateway reports readiness.
        while True:
            event = json.loads(await asyncio.wait_for(socket.recv(), 15))
            if event.get('type') == 'asr.ready': break
            if event.get('type') == 'error': raise RuntimeError(event.get('message', 'Gateway error'))
        options = {'extra_settings': sd.WasapiSettings(auto_convert=True)}
        with ExitStack() as stack:
            input_stream = sd.RawInputStream(samplerate=16000, channels=1, dtype='int16', blocksize=320, device=host['default_input_device'], callback=input_callback, **options)
            stack.callback(input_stream.close)
            output_stream = sd.RawOutputStream(samplerate=16000, channels=1, dtype='int16', blocksize=320, device=host['default_output_device'], callback=output_callback, **options)
            stack.callback(output_stream.close)
            clocks['input'], clocks['output'] = _clock_offset(input_stream), _clock_offset(output_stream)
            input_stream.start()
            stack.callback(input_stream.stop)
            output_stream.start()
            stack.callback(output_stream.stop)
            print('Listening locally. Press I to interrupt, Q or Ctrl+C to stop. ' + ('Experimental echo cancellation enabled.' if aec else 'Speaker-safe mode enabled.') + f' VAD: {vad}.' + (' Experimental speaker extraction enabled.' if extractor_factory else ''), flush=True)

            async def send_audio():
                nonlocal generation
                worker = None
                worker_epoch = None
                try:
                    while True:
                        if failure.is_set(): raise RuntimeError(failure_message[0])
                        try: frame = await asyncio.to_thread(capture.get, True, 0.1)
                        except Empty: continue
                        playing = playback.active()
                        if extractor_factory:
                            epoch, captured_playing, frame = frame
                            if epoch != audio_epoch or captured_playing or playing:
                                if worker is not None:
                                    await worker.close(); worker = None; worker_epoch = None
                                for item in detector.feed(bytes(640), playback_active=True):
                                    await socket.send(json.dumps(item))
                                if speech_detector is not None: speech_detector.reset()
                                continue
                            if worker is None or worker_epoch != epoch:
                                if worker is not None: await worker.close()
                                worker = await asyncio.to_thread(extractor_factory)
                                worker_epoch = epoch
                            frames = await worker.feed(frame)
                            if epoch != audio_epoch or playback.active():
                                await worker.close(); worker = None; worker_epoch = None
                                detector.reset()
                                if speech_detector is not None: speech_detector.reset()
                                continue
                        else:
                            frames = [frame]
                        for frame in frames:
                            speech_active = None
                            if speech_detector is not None:
                                if playing and not aec:
                                    speech_detector.reset()
                                    speech_active = False
                                else:
                                    probability = speech_detector.feed(frame)
                                    speech_active = probability is not None and probability >= 0.5
                            for item in detector.feed(frame, playback_active=playing, allow_barge_in=aec, speech_active=speech_active):
                                if isinstance(item, bytes): await socket.send(item)
                                else:
                                    if item['type'] == 'interrupt':
                                        playback.interrupt(); generation = None
                                        print(json.dumps({'type':'playback.interrupted','reason':item.get('reason'),'elapsed_ms':round((time.monotonic()-playback_started)*1000)}), flush=True)
                                    await socket.send(json.dumps(item))
                finally:
                    if worker is not None: await worker.close()

            async def receive_audio():
                nonlocal generation, playback_started, audio_epoch
                async for message in socket:
                    if isinstance(message, bytes):
                        if generation is not None:
                            for offset in range(0, len(message), 4800):
                                current = generation
                                while playback.buffered_frames() > 32000 and generation == current:
                                    await asyncio.sleep(0.02)
                                if generation != current: break
                                playback.append(current, message[offset:offset + 4800])
                        continue
                    event = json.loads(message)
                    kind = event.get('type')
                    if kind == 'speech.start':
                        if event.get('sample_rate') != 24000: raise RuntimeError('Unexpected gateway output rate')
                        audio_epoch += 1
                        generation = playback.begin()
                        playback_started = time.monotonic()
                    elif kind == 'speech.end' and generation is not None:
                        playback.finish(generation)
                    elif kind == 'speech.cancelled':
                        playback.interrupt(); generation = None
                    elif kind in ('user.text', 'assistant.text', 'task.started', 'task.completed', 'task.rejected', 'task.reused', 'task.error', 'error'):
                        print(json.dumps(event, ensure_ascii=False), flush=True)
                    if kind == 'error': raise RuntimeError(event.get('message', 'Gateway error'))
                raise RuntimeError('Gateway disconnected')

            async def keyboard():
                nonlocal generation, audio_epoch
                import msvcrt
                while True:
                    if msvcrt.kbhit():
                        action = await _keyboard_action(msvcrt.getwch(), playback, detector, socket, speech_detector)
                        if action == 'interrupt': generation = None; audio_epoch += 1
                        if action == 'quit': return
                    await asyncio.sleep(0.05)

            tasks = [asyncio.create_task(send_audio()), asyncio.create_task(receive_audio())]
            if sys.stdin.isatty(): tasks.append(asyncio.create_task(keyboard()))
            try:
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done: task.result()
            finally:
                for task in tasks: task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                playback.interrupt()


def main():
    parser = argparse.ArgumentParser(description='Experimental local Windows audio client')
    parser.add_argument('--url', default='ws://127.0.0.1:18088/voice')
    parser.add_argument('--threshold', type=float, default=0.025)
    parser.add_argument('--aec', action='store_true', help='Enable experimental native echo cancellation and voice interruption')
    parser.add_argument('--vad', choices=('energy', 'silero'), default='energy', help='Optional CPU speech classifier, combined with the RMS threshold')
    parser.add_argument('--vad-model', default='.cache/silero-vad-research/silero_vad/data/silero_vad.onnx')
    parser.add_argument('--speaker-enrollment', help='Experimental: local mono 16 kHz PCM16 WAV of the intended speaker (3–30 seconds); speaker-safe only')
    args = parser.parse_args()
    try: asyncio.run(run(args.url, threshold=args.threshold, aec=args.aec, vad=args.vad, vad_model=args.vad_model, speaker_enrollment=args.speaker_enrollment))
    except KeyboardInterrupt: print('\nStopped.')


if __name__ == '__main__':
    main()
