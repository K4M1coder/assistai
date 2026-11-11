"""Exercise native playback buffering with the real local gateway, without devices."""
import asyncio
import json
import os

import numpy as np
from websockets.asyncio.client import connect

from prototype.native_playback import NativePlayback


async def main():
    url = os.environ.get('ASSISTAI_TEST_VOICE_URL', 'ws://127.0.0.1:18088/voice')
    playback = NativePlayback()
    result = {'speech_started': False, 'speech_ended': False, 'pcm_bytes': 0, 'nonzero_samples': 0}
    generation = None
    sent = False
    async with connect(url) as socket:
        async def drain():
            while not result['speech_ended'] or playback.active():
                if result['speech_started']:
                    data = playback.read_frames(320)
                    result['pcm_bytes'] += len(data)
                    result['nonzero_samples'] += int(np.count_nonzero(np.frombuffer(data, dtype='<i2')))
                await asyncio.sleep(0.02)

        async def receive():
            nonlocal generation, sent
            async for message in socket:
                if isinstance(message, bytes):
                    if generation is not None:
                        playback.append(generation, message)
                    continue
                event = json.loads(message)
                if event['type'] == 'asr.ready' and not sent:
                    sent = True
                    await socket.send(json.dumps({'type':'text', 'text':'Dis bonjour en francais.'}))
                elif event['type'] == 'speech.start':
                    if event.get('sample_rate') != 24000:
                        raise RuntimeError('Expected 24 kHz gateway output')
                    generation = playback.begin()
                    result['speech_started'] = True
                elif event['type'] == 'speech.end':
                    if generation is None or not playback.finish(generation):
                        raise RuntimeError('Missing playback generation')
                    result['speech_ended'] = True
                    return
                elif event['type'] == 'error':
                    raise RuntimeError(event.get('message', 'Gateway error'))
        consumer = asyncio.create_task(drain())
        try:
            await asyncio.wait_for(receive(), 30)
            await asyncio.wait_for(consumer, 10)
        finally:
            consumer.cancel()
    print(json.dumps(result))
    if not result['speech_ended'] or result['nonzero_samples'] == 0:
        raise RuntimeError('No nonzero speech playback produced')


if __name__ == '__main__':
    asyncio.run(main())
