"""Send a synthetic 16 kHz WAV through native turn detection and the gateway."""
import asyncio
import json
import os
import wave

import numpy as np
from websockets.asyncio.client import connect

from prototype.native_playback import NativePlayback
from prototype.native_turn import NativeTurnDetector


async def main():
    with wave.open('.cache/reset-question.wav', 'rb') as source:
        if source.getframerate() != 16000 or source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError('Expected a 16 kHz mono PCM16 fixture')
        pcm = source.readframes(source.getnframes())
    pcm += bytes((-len(pcm)) % 640) + bytes(640 * 40)
    url = os.environ.get('ASSISTAI_TEST_VOICE_URL', 'ws://127.0.0.1:18088/voice')
    detector, playback = NativeTurnDetector(threshold=0.01), NativePlayback()
    if os.environ.get('ASSISTAI_TEST_VAD') == 'silero':
        from prototype.silero_vad import SileroSpeechDetector
        classifier = SileroSpeechDetector('.cache/silero-vad-research/silero_vad/data/silero_vad.onnx')
    else:
        classifier = None
    result = {'starts':0, 'ends':0, 'transcript':'', 'response':'', 'playback_nonzero_samples':0}
    generation = None
    finished = asyncio.Event()
    async with connect(url) as socket:
        async def feed():
            for offset in range(0, len(pcm), 640):
                frame = pcm[offset:offset + 640]
                probability = classifier.feed(frame) if classifier else None
                speech_active = (probability is not None and probability >= 0.5) if classifier else None
                for event in detector.feed(frame, speech_active=speech_active):
                    if isinstance(event, bytes): await socket.send(event)
                    else:
                        if event['type'] == 'audio.start': result['starts'] += 1
                        if event['type'] == 'audio.end': result['ends'] += 1
                        await socket.send(json.dumps(event))
                await asyncio.sleep(0.02)

        async def drain():
            while not finished.is_set() or playback.active():
                chunk = playback.read_frames(320)
                result['playback_nonzero_samples'] += int(np.count_nonzero(np.frombuffer(chunk, dtype='<i2')))
                await asyncio.sleep(0.02)

        async def receive():
            nonlocal generation
            async for message in socket:
                if isinstance(message, bytes):
                    if generation is not None:
                        for offset in range(0, len(message), 4800):
                            while playback.buffered_frames() > 32000:
                                await asyncio.sleep(0.02)
                            playback.append(generation, message[offset:offset + 4800])
                    continue
                event = json.loads(message)
                kind = event.get('type')
                if kind == 'asr.ready': asyncio.create_task(feed())
                elif kind == 'user.text': result['transcript'] = event.get('text', '')
                elif kind == 'assistant.text': result['response'] = event.get('text', '')
                elif kind == 'speech.start':
                    if event.get('sample_rate') != 24000: raise RuntimeError('Unexpected speech rate')
                    generation = playback.begin()
                elif kind == 'speech.end':
                    if generation is None or not playback.finish(generation): raise RuntimeError('Missing speech start')
                    finished.set()
                    return
                elif kind == 'error': raise RuntimeError(event.get('message', 'Gateway error'))
        drainer = asyncio.create_task(drain())
        try:
            await asyncio.wait_for(receive(), 30)
            await asyncio.wait_for(drainer, 10)
        finally:
            drainer.cancel()
    print(json.dumps(result, ensure_ascii=False))
    if result['starts'] != 1 or result['ends'] != 1 or not result['transcript'] or not result['response'] or not result['playback_nonzero_samples']:
        raise RuntimeError('Synthetic native audio turn failed')


if __name__ == '__main__':
    asyncio.run(main())
