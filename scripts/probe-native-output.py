"""Transcribe the saved synthetic native-model output with a local CPU recognizer."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import wave

import numpy as np
import soxr

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--concurrent', action='store_true')
parser.add_argument('--browser-run-id')
parser.add_argument('--sample', choices=('audio-f16','interleaved-f16','audio-q8','interleaved-q8','interleaved-q8-reasoning-off','interleaved-q8-reasoning-off-repeat2','agent-notification','browser-agent-notification','browser-capture-roundtrip','pocket-agent-notification'))
options = parser.parse_args()
if options.browser_run_id is not None and (options.sample != 'browser-agent-notification' or
        not re.fullmatch(r'[A-Za-z0-9_-]{1,40}', options.browser_run_id)):
    raise ValueError('Browser run ID requires browser-agent-notification and a simple identifier')
spec = importlib.util.spec_from_file_location('asr_coding', ROOT / 'scripts/probe-asr-coding.py')
asr = importlib.util.module_from_spec(spec); spec.loader.exec_module(asr)
filename = 'lfm3-omni-concurrent-output.wav' if options.concurrent else 'lfm3-omni-capital-output.wav'
if options.sample:
    if options.concurrent: raise ValueError('Choose one saved output')
    filename = {'audio-f16':'lfm3-omni-audio-f16-output.wav',
                'interleaved-f16':'lfm3-omni-interleaved-f16-output.wav',
                'audio-q8':'lfm3-omni-audio-output.wav',
                'interleaved-q8':'lfm3-omni-interleaved-output.wav',
                'interleaved-q8-reasoning-off':'lfm3-omni-interleaved-q8-output.wav',
                'interleaved-q8-reasoning-off-repeat2':'lfm3-omni-interleaved-q8-repeat2-output.wav',
                'agent-notification':'native-agent-notification.wav',
                'browser-agent-notification':'native-browser-notification.wav',
                'browser-capture-roundtrip':'native-browser-capture-roundtrip.wav',
                'pocket-agent-notification':'pocket-agent-notification.wav'}[options.sample]
    if options.browser_run_id:
        filename = f'native-browser-notification-{options.browser_run_id}.wav'
with wave.open(str(ROOT / '.cache' / filename), 'rb') as source:
    if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, 24000):
        raise ValueError('Unexpected native output format')
    samples = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)
pcm = np.clip(soxr.resample(samples, 24000, 16000), -32768, 32767).astype('<i2').tobytes()
executable = ROOT / '.cache/crispasr-v0.8.53-windows-cpu/crispasr-windows-x86_64-cpu/crispasr.exe'
model = ROOT / '.cache/kyutai-crisp-research/kyutai-stt-1b-q4_k.gguf'
text, elapsed = asr.recognize_crisp(pcm + bytes(32000), executable, model, 'kyutai-stt', allow_empty=True)
reference = 'Le mot secret est BLUEBIRD.' if options.sample in ('agent-notification','browser-agent-notification','browser-capture-roundtrip') else 'La capitale de la France est Paris.'
if options.sample in ('browser-agent-notification','pocket-agent-notification'):
    metadata_file = (f'native-browser-notification-{options.browser_run_id}.json' if options.browser_run_id else 'native-browser-notification.json') if options.sample == 'browser-agent-notification' else 'pocket-agent-notification.json'
    metadata = json.loads((ROOT / '.cache' / metadata_file).read_text(encoding='utf-8'))
    reference = metadata.get('notification_text')
    if not isinstance(reference, str) or not reference.strip() or len(reference) > 1000:
        raise ValueError('Missing or invalid browser notification text')
print(json.dumps({'sample':filename, 'output_asr': text, 'reference': reference,
                  'normalized_wer': asr.word_error(reference, text),
                  'audio_seconds': len(samples)/24000, 'elapsed_ms_including_load': elapsed,
                  'physical_devices_opened': False}, ensure_ascii=False), flush=True)
