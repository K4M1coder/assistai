"""Synthetic French speech to a disposable, explicitly configured coding task."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit

from websockets.asyncio.client import connect

spec = importlib.util.spec_from_file_location('spoken_recall_probe', Path(__file__).with_name('probe-spoken-session-recall.py'))
spoken_recall = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spoken_recall)


async def main():
    root = Path(__file__).resolve().parents[1]
    cache = (root / '.cache').resolve()
    workspace = Path(os.environ['ASSISTAI_PROBE_WORKSPACE']).resolve(strict=True)
    if workspace == cache or not workspace.is_relative_to(cache):
        raise ValueError('Probe workspace must be inside .cache')
    fixture = (workspace / 'calculator.py').resolve(strict=True)
    if fixture.parent != workspace or 'return a - b' not in fixture.read_text(encoding='utf-8'):
        raise ValueError('Expected the unmodified subtraction fixture')
    url = os.environ['ASSISTAI_TEST_VOICE_URL']
    address = urlsplit(url)
    if address.scheme != 'ws' or address.hostname not in ('127.0.0.1', 'localhost', '::1'):
        raise ValueError('Gateway must use a loopback WebSocket')
    phrase = "Dans le fichier calculator point py, corrige la fonction add pour faire une addition au lieu d'une soustraction. Ne change rien d'autre."
    started = time.monotonic()
    pcm = await asyncio.to_thread(spoken_recall.synthesize, phrase)
    transcript = ''; task = ''; task_turn = None; followup = None; audio_bytes = 0; tasks = 0
    async with connect(url) as ws:
        while True:
            message = await asyncio.wait_for(ws.recv(), 20)
            if isinstance(message, bytes): continue
            event = json.loads(message)
            if event.get('type') == 'asr.ready': break
            if event.get('type') == 'error': raise RuntimeError(event.get('message'))
        await ws.send(json.dumps({'type': 'audio.start'}))
        for offset in range(0, len(pcm), 3200):
            await ws.send(pcm[offset:offset + 3200]); await asyncio.sleep(.1)
        await ws.send(json.dumps({'type': 'audio.end'}))
        while True:
            message = await asyncio.wait_for(ws.recv(), 120)
            if isinstance(message, bytes): audio_bytes += len(message); continue
            event = json.loads(message); kind = event.get('type')
            elapsed = round((time.monotonic() - started) * 1000)
            if kind in ('user.text', 'task.started', 'task.completed', 'assistant.text', 'error', 'task.error', 'task.rejected'):
                trace = {'event': kind, 'elapsed_ms': elapsed, 'turn_id': event.get('turn_id')}
                if kind == 'user.text': trace['synthetic_transcript'] = event.get('text', '')[:2000]
                if kind == 'task.started': trace['synthetic_task'] = event.get('task', '')[:2000]
                if kind == 'assistant.text': trace['synthetic_response'] = event.get('text', '')[:2000]
                print(json.dumps(trace, ensure_ascii=False), file=sys.stderr, flush=True)
            if kind == 'user.text': transcript = event.get('text', '')
            elif kind == 'task.started':
                tasks += 1; task = event.get('task', ''); task_turn = event.get('turn_id')
                await ws.send(json.dumps({'type':'text', 'text':'Dis-moi bonjour en français.'}))
            elif kind == 'assistant.text' and task_turn and event.get('turn_id') and event['turn_id'] != task_turn and followup is None:
                followup = elapsed
            elif kind == 'task.completed':
                check = subprocess.run([sys.executable, '-I', str(root / 'scripts' / 'verify-add-fixture.py'), str(fixture)], capture_output=True, text=True, timeout=5)
                result = {'input':'synthetic_french_speech', 'transcript':transcript, 'task':task, 'task_count':tasks,
                          'followup_ms':followup, 'task_end_ms':elapsed, 'audio_bytes':audio_bytes, 'static_fixture_check_exit':check.returncode,
                          'physical_audio_devices_opened':False, 'audio_listened_to':False}
                print(json.dumps(result, ensure_ascii=False), flush=True)
                if tasks != 1 or 'calculator.py' not in task.lower() or followup is None or followup >= elapsed or not audio_bytes or check.returncode:
                    raise RuntimeError('Spoken coding probe assertions failed')
                return
            elif kind in ('error','task.error','task.rejected','asr.empty'):
                raise RuntimeError(f"{kind}: {event.get('message', '')}")


if __name__ == '__main__':
    asyncio.run(main())
