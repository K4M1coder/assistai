"""Transcribe locally synthesized French speech; report semantic cue checks."""
import json
import time
import requests

start = time.monotonic()
with open('.cache/lfm3-tool-french.wav', 'rb') as source:
    response = requests.post('http://127.0.0.1:18092/v1/audio/transcriptions',
        files={'file': ('sample.wav', source, 'audio/wav')},
        data={'model': 'local', 'language': 'fr'}, timeout=50)
response.raise_for_status()
body = response.json()
text = body.get('text', '')
folded = text.casefold()
passed = 'paris' in folded and ('météo' in folded or 'meteo' in folded)
print(json.dumps({'elapsed_ms': round((time.monotonic()-start)*1000), 'text': text,
                  'weather_and_city_present': passed}, ensure_ascii=False))
if not passed:
    raise SystemExit(1)
