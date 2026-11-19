"""Research-only Piper/DirectML probe; run under the Windows resource watchdog."""
import json
from pathlib import Path
import time
import wave

import onnxruntime as ort
from piper.config import PiperConfig
from piper.voice import PiperVoice

root = Path(__file__).resolve().parents[1]
model = root / '.cache/piper-directml-research/fr_FR-siwis-medium.onnx'
output = root / '.cache/piper-directml-research/notification.wav'
if output.exists():
    raise FileExistsError(output)
options = ort.SessionOptions()
options.enable_mem_pattern = False
options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
options.add_session_config_entry('session.disable_cpu_ep_fallback', '1')
started = time.monotonic()
session = ort.InferenceSession(str(model), sess_options=options, providers=[('DmlExecutionProvider', {'device_id': 0})])
voice = PiperVoice(session=session, config=PiperConfig.from_dict(json.loads(Path(str(model) + '.json').read_text(encoding='utf-8'))))
loaded = time.monotonic()
text = 'La tâche en arrière-plan est terminée. Extrait du résultat : Le mot secret est BLUEBIRD.'
chunks = list(voice.synthesize(text))
if not chunks or any(chunk.sample_rate != 22050 or chunk.sample_channels != 1 or chunk.sample_width != 2 for chunk in chunks):
    raise ValueError('Unexpected or empty output')
with output.open('xb') as target, wave.open(target, 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(22050)
    wav.writeframes(b''.join(chunk.audio_int16_bytes for chunk in chunks))
print(json.dumps({'runtime': ort.__version__, 'providers': session.get_providers(), 'device_id': 0,
                  'cpu_fallback_disabled': True, 'load_seconds': loaded-started,
                  'synthesis_seconds': time.monotonic()-loaded, 'output': str(output),
                  'text': text}, ensure_ascii=False), flush=True)
