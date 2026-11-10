"""Send a generated red image to the local vision model without storing user data."""
import base64
import json
import struct
import time
import zlib
import requests


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


image = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0))
         + chunk(b'IDAT', zlib.compress((b'\0' + b'\xff\0\0' * 64) * 64)) + chunk(b'IEND', b''))
url = 'data:image/png;base64,' + base64.b64encode(image).decode('ascii')
payload = {'model': 'local', 'messages': [{'role': 'user', 'content': [
    {'type': 'text', 'text': 'What is the dominant color? Answer in one word.'},
    {'type': 'image_url', 'image_url': {'url': url}},
]}], 'max_tokens': 64, 'temperature': 0, 'chat_template_kwargs': {'enable_thinking': False}}
start = time.perf_counter()
response = requests.post('http://127.0.0.1:18080/v1/chat/completions', json=payload, timeout=60)
response.raise_for_status()
answer = response.json()['choices'][0]['message']['content']
print(json.dumps({'elapsed_ms': round((time.perf_counter() - start) * 1000), 'answer': answer}))
if answer.strip().lower().strip('.!') != 'red':
    raise SystemExit('Unexpected response')
