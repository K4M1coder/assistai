"""Send a fixed synthetic WAV to the guarded local native voice trial."""
import argparse
import asyncio
import base64
import json
from pathlib import Path
import time
import wave

from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parents[1]


async def main(mode, variant, repeat, scenario):
    fixture = ROOT / ('.cache/lfm3-math-windows.wav' if scenario == 'math-windows' else f'.cache/kyutai-persistent-synthetic-{scenario}.wav')
    with wave.open(str(fixture), 'rb') as source:
        if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 16000):
            raise ValueError('Expected mono 16 kHz PCM16')
        pcm = source.readframes(source.getnframes())
    suffix = '' if repeat == 1 else f'-repeat{repeat}'
    scenario_prefix = '' if scenario == 'capital' else f'{scenario}-'
    output = ROOT / f'.cache/lfm3-omni-{scenario_prefix}{mode}-{variant}{suffix}-output.wav'
    if output.exists(): raise FileExistsError('Output exists; preserve it and choose another run')
    modalities = ['text', 'audio'] if mode == 'interleaved' else ['audio']
    chunks = []; audio_bytes = 0; text = ''; counts = {}; sent_at = None; first_audio = None
    boundary_jumps = []
    started = time.monotonic(); configured = False
    async with connect('ws://127.0.0.1:18210/v1/realtime', open_timeout=5, max_size=4*1024*1024) as socket:
        event = json.loads(await asyncio.wait_for(socket.recv(), 5))
        if event.get('type') != 'session.created': raise RuntimeError('No realtime session')
        audio = event.get('session', {}).get('audio', {})
        if audio.get('input', {}).get('format', {}).get('rate') != 16000 or audio.get('output', {}).get('format', {}).get('rate') != 24000:
            raise RuntimeError('Unexpected session sample rate')
        await socket.send(json.dumps({'type':'session.update','session':{'type':'realtime',
            'instructions':'Respond briefly in French.', 'output_modalities':modalities}}))
        while True:
            event = json.loads(await asyncio.wait_for(socket.recv(), 45)); kind = event.get('type')
            counts[kind] = counts.get(kind, 0) + 1
            if kind == 'session.updated' and not configured:
                configured = True
                for offset in range(0, len(pcm), 3200):
                    await socket.send(json.dumps({'type':'input_audio_buffer.append',
                                                  'audio':base64.b64encode(pcm[offset:offset+3200]).decode()}))
                sent_at = time.monotonic()
                await socket.send(json.dumps({'type':'response.create'}))
            elif kind == 'response.output_audio.delta':
                if sent_at is None: raise RuntimeError('Audio arrived before request')
                if first_audio is None: first_audio = round((time.monotonic()-sent_at)*1000)
                chunk = base64.b64decode(event.get('delta', ''), validate=True)
                if not chunk: continue
                audio_bytes += len(chunk)
                if audio_bytes > 4*1024*1024 or len(chunk)%2 or len(chunks) >= 4096: raise RuntimeError('Invalid or excessive output audio')
                if chunks:
                    boundary_jumps.append(abs(int.from_bytes(chunk[:2], 'little', signed=True) -
                                              int.from_bytes(chunks[-1][-2:], 'little', signed=True)))
                chunks.append(chunk)
            elif kind in ('response.output_text.delta', 'response.output_audio_transcript.delta'):
                text += event.get('delta', '')
            elif kind == 'error': raise RuntimeError('Realtime backend returned an error')
            elif kind == 'response.done':
                if event.get('response', {}).get('status') != 'completed' or not audio_bytes:
                    raise RuntimeError('Response incomplete or no audio')
                with output.open('xb') as raw:
                    with wave.open(raw, 'wb') as wav:
                        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000); wav.writeframes(b''.join(chunks))
                print(json.dumps({'mode':mode, 'variant_label':variant, 'repeat':repeat, 'scenario':scenario, 'text':text, 'audio_bytes':audio_bytes,
                    'audio_seconds':audio_bytes/48000, 'response_ms':round((time.monotonic()-sent_at)*1000),
                    'first_audio_ms':first_audio, 'total_ms':round((time.monotonic()-started)*1000),
                    'events':counts, 'output_audio_chunk_bytes':[len(chunk) for chunk in chunks],
                    'output_audio_boundary_jumps':boundary_jumps,
                    'output':str(output), 'physical_devices_opened':False}, ensure_ascii=False), flush=True)
                return


if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--mode', choices=('audio','interleaved'), required=True)
    parser.add_argument('--variant', choices=('f16','q8'), required=True)
    parser.add_argument('--repeat', type=int, choices=range(1,11), default=1)
    parser.add_argument('--scenario', choices=('capital','math','math-windows'), default='capital')
    args=parser.parse_args(); asyncio.run(main(args.mode, args.variant, args.repeat, args.scenario))
