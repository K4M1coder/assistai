"""Probe a guarded loopback Omni server with synthetic images and a recorded tool request.

This script observes a proposed tool call and never executes it.
"""
import asyncio
import base64
import importlib.util
import json
from pathlib import Path
import time
import wave

import requests
from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('image_probe', ROOT / 'scripts/probe-spoken-image.py')
image_probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(image_probe)


def vision():
    results=[]
    for name, rgb in (('red',(255,0,0)), ('blue',(0,0,255))):
        image = 'data:image/png;base64,' + base64.b64encode(image_probe.solid_png(rgb)).decode('ascii')
        body = {'model':'local','messages':[{'role':'user','content':[
            {'type':'text','text':'Quelle est la couleur dominante ? Réponds en un mot en français.'},
            {'type':'image_url','image_url':{'url':image}}]}], 'temperature':0, 'max_tokens':32}
        started=time.monotonic()
        response=requests.post('http://127.0.0.1:18210/v1/chat/completions',json=body,timeout=35)
        response.raise_for_status()
        results.append({'input':name,'text':response.json()['choices'][0]['message']['content'],
                        'elapsed_ms':round((time.monotonic()-started)*1000)})
    return results


async def tool_call():
    with wave.open(str(ROOT / '.cache/lfm3-tool-french.wav'), 'rb') as source:
        if (source.getnchannels(),source.getsampwidth(),source.getframerate()) != (1,2,16000):
            raise ValueError('Expected mono 16 kHz PCM16')
        pcm=source.readframes(source.getnframes())
    tool={'type':'function','name':'delegate_task','description':'Delegate a task to a background agent',
          'parameters':{'type':'object','properties':{'task':{'type':'string'}},'required':['task']}}
    async with connect('ws://127.0.0.1:18210/v1/realtime',open_timeout=5,max_size=4*1024*1024) as socket:
        event=json.loads(await asyncio.wait_for(socket.recv(),5))
        if event.get('type') != 'session.created': raise RuntimeError('No realtime session')
        await socket.send(json.dumps({'type':'session.update','session':{'type':'realtime',
            'instructions':'Respond in French with function calls.\n\nList of tools:','tools':[tool]}}))
        sent=False
        while True:
            event=json.loads(await asyncio.wait_for(socket.recv(),30)); kind=event.get('type')
            if kind=='session.updated' and not sent:
                sent=True
                for offset in range(0,len(pcm),3200):
                    await socket.send(json.dumps({'type':'input_audio_buffer.append',
                        'audio':base64.b64encode(pcm[offset:offset+3200]).decode()}))
                await socket.send(json.dumps({'type':'response.create'}))
            elif kind=='error': raise RuntimeError('Realtime backend returned an error')
            elif kind=='response.done':
                response=event.get('response',{})
                calls=[{'name':item.get('name'),'arguments':item.get('arguments')}
                       for item in response.get('output',[]) if item.get('type')=='function_call']
                return {'status':response.get('status'),'calls':calls}


if __name__=='__main__':
    print(json.dumps({'vision':vision(),'tool_proposal':asyncio.run(tool_call()),
                      'tool_executed':False,'physical_devices_opened':False},ensure_ascii=False),flush=True)
