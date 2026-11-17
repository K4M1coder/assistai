"""Exercise real loopback WebSockets without opening devices or loading a model."""
import asyncio
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

ROOT = Path(__file__).resolve().parents[1]


async def exercise(port):
    url = f'ws://127.0.0.1:{port}/asr'
    clients = []
    try:
        for _ in range(4):
            client = await connect(url, open_timeout=5)
            clients.append(client)
            ready = json.loads(await asyncio.wait_for(client.recv(), 5))
            if ready.get('type') != 'ready': raise RuntimeError('Unexpected ready event')
        async with connect(url, open_timeout=5) as rejected:
            try:
                await asyncio.wait_for(rejected.recv(), 5)
                raise RuntimeError('Excess connection was not rejected')
            except ConnectionClosed as error:
                if error.code != 1013: raise
        await clients.pop().close()
        async with connect(url, open_timeout=5) as replacement:
            ready = json.loads(await asyncio.wait_for(replacement.recv(), 5))
            if ready.get('type') != 'ready': raise RuntimeError('Capacity was not released')
        return {'accepted':4, 'excess_close_code':1013, 'replacement_ready':True}
    finally:
        await asyncio.gather(*(client.close() for client in clients), return_exceptions=True)


def main():
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0)); port = reservation.getsockname()[1]
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'prototype.kyutai_asr_server:app',
                                '--host', '127.0.0.1', '--port', str(port), '--log-level', 'warning'],
                               cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        deadline = time.monotonic() + 15
        while True:
            if process.poll() is not None: raise RuntimeError('Temporary server exited')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=1) as response:
                    if response.status == 200: break
            except (OSError, urllib.error.URLError):
                if time.monotonic() >= deadline: raise TimeoutError('Temporary server did not start')
                time.sleep(.1)
        result = asyncio.run(exercise(port))
        result.update({'physical_devices_opened':False, 'model_inference':False})
        print(json.dumps(result), flush=True)
    finally:
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)


if __name__ == '__main__':
    main()
