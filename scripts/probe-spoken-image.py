"""Probe a synthetic French spoken question and generated image on a loopback gateway."""
import asyncio
import argparse
import base64
import importlib.util
import json
from pathlib import Path
import struct
import time
from urllib.parse import urlsplit
import zlib

from websockets.asyncio.client import connect

spec = importlib.util.spec_from_file_location('spoken_recall', Path(__file__).with_name('probe-spoken-session-recall.py'))
spoken = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spoken)


def solid_png(rgb):
    def chunk(name, payload):
        return struct.pack('>I', len(payload)) + name + payload + struct.pack('>I', zlib.crc32(name + payload))
    row = b'\0' + bytes(rgb) * 64
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(row * 64)) + chunk(b'IEND', b''))


async def run(url='ws://127.0.0.1:18091/voice', color='red'):
    address = urlsplit(url)
    if address.scheme != 'ws' or address.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise ValueError('Gateway must be a loopback WebSocket')
    question = 'Quelle est la couleur dominante de cette image ? Réponds en un mot.'
    pcm = await asyncio.to_thread(spoken.synthesize, question)
    rgb, expected = {'red': ((255, 0, 0), 'rouge'), 'blue': ((0, 0, 255), 'bleu')}[color]
    image = 'data:image/png;base64,' + base64.b64encode(solid_png(rgb)).decode('ascii')
    started = time.monotonic(); transcript = ''; answer = ''; audio_bytes = 0; supported = False
    async with connect(url) as ws:
        while True:
            message = await asyncio.wait_for(ws.recv(), 20)
            if isinstance(message, bytes): continue
            event = json.loads(message)
            if event.get('type') == 'session.capabilities': supported = event.get('spoken_image_input') is True
            if event.get('type') == 'asr.ready': break
            if event.get('type') == 'error': raise RuntimeError(event.get('message'))
        if not supported: raise RuntimeError('Gateway does not advertise spoken image input')
        await ws.send(json.dumps({'type':'audio.start'}))
        for offset in range(0, len(pcm), 3200):
            await ws.send(pcm[offset:offset + 3200]); await asyncio.sleep(.1)
        await ws.send(json.dumps({'type':'audio.end', 'image':image}))
        while True:
            message = await asyncio.wait_for(ws.recv(), 90)
            if isinstance(message, bytes): audio_bytes += len(message); continue
            event = json.loads(message); kind = event.get('type')
            if kind == 'user.text': transcript = event.get('text', '')
            if kind == 'assistant.text': answer = event.get('text', '')
            if kind == 'speech.end': break
            if kind in ('error', 'asr.empty'): raise RuntimeError(f'{kind}: {event.get("message", "")}')
    result = {'question':question, 'expected_color':expected, 'transcript':transcript, 'answer':answer, 'audio_bytes':audio_bytes,
              'elapsed_ms':round((time.monotonic() - started) * 1000), 'physical_devices_opened':False,
              'audio_saved':False, 'image_saved':False}
    print(json.dumps(result, ensure_ascii=False), flush=True)
    if not transcript.startswith('[Image]') or expected not in answer.lower() or not audio_bytes:
        raise RuntimeError('Synthetic spoken-image assertions failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--gateway', default='ws://127.0.0.1:18091/voice')
    parser.add_argument('--color', choices=('red', 'blue'), default='red')
    args = parser.parse_args()
    asyncio.run(run(args.gateway, args.color))
