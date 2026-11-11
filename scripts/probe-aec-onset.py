"""Compare energy-onset settings on one deterministic synthetic AEC replay."""
import importlib.util
import json
from pathlib import Path
import subprocess
import wave

import numpy as np
from scipy.signal import resample_poly

from prototype.native_turn import NativeTurnDetector

root = Path('.cache/hf-speech-research')
revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
if revision != 'ebc09bf286edbe8739a59575709070f056d31e29': raise SystemExit('Unexpected comparator revision')
path = root / 'src/speech_to_speech/api/openai_realtime/echo_canceller.py'
spec = importlib.util.spec_from_file_location('research_echo_canceller', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with wave.open('.cache/french-test.wav', 'rb') as source:
    if source.getframerate() != 24000 or source.getnchannels() != 1 or source.getsampwidth() != 2:
        raise ValueError('Expected 24 kHz mono PCM16 fixture')
    data = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32)
fragment = resample_poly(data, 2, 3)
rate, duration, frame = 16000, 12, 320
index = np.arange(rate * duration)
render = np.clip(fragment[index % len(fragment)], -32768, 32767).astype('<i2')
delayed = np.zeros(len(render), dtype=np.float32)
delayed[320:] = render[:-320] * 0.4
near = np.zeros(len(render), dtype=np.float32)
near[8 * rate:] = 0.35 * fragment[(index[8 * rate:] + len(fragment) // 3) % len(fragment)]
results = []
for mode in ('echo_only', 'overlap'):
    microphone = delayed if mode == 'echo_only' else delayed + near
    microphone = np.clip(microphone, -32768, 32767).astype('<i2')
    aec = module.EchoCanceller(rate, rate)
    detectors = {n:NativeTurnDetector(threshold=0.025, onset_frames=n, pre_roll_frames=max(5, n)) for n in (3, 5, 10)}
    first = {n:None for n in detectors}
    for start in range(0, len(render), frame):
        aec.render(render[start:start + frame].tobytes(), start / rate)
        cleaned = aec.capture(microphone[start:start + frame].tobytes(), start / rate)
        if aec._failed or len(cleaned) != frame * 2: raise RuntimeError('AEC failed or returned unexpected frame')
        for onset, detector in detectors.items():
            if first[onset] is not None: continue
            events = detector.feed(cleaned, playback_active=True, allow_barge_in=True)
            if any(isinstance(event, dict) and event.get('type') == 'interrupt' for event in events):
                first[onset] = round((start + frame) * 1000 / rate)
    for onset, timestamp in first.items():
        results.append({'mode':mode, 'onset_frames':onset, 'first_interrupt_ms':timestamp,
                        'interrupt_after_overlap_ms':None if timestamp is None or mode != 'overlap' else timestamp - 8000})
print(json.dumps({'frame_ms':20, 'threshold':0.025, 'results':results,
                  'note':'Synthetic same-voice shifted overlap; not real-device performance.'}))
