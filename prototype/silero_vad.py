"""Optional CPU-only Silero speech probability for the experimental native client."""
import hashlib
from pathlib import Path

import numpy as np

EXPECTED_SHA256 = '1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3'


class SileroSpeechDetector:
    """Consume 20 ms PCM16 frames, evaluating the 32 ms stateful ONNX model."""

    def __init__(self, model_path, *, session=None):
        if session is None:
            import onnxruntime as ort
            path = Path(model_path)
            if hashlib.sha256(path.read_bytes()).hexdigest() != EXPECTED_SHA256:
                raise ValueError('Unexpected Silero VAD model digest')
            options = ort.SessionOptions()
            options.intra_op_num_threads = 1
            options.inter_op_num_threads = 1
            session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
        self._session = session
        self.reset()

    def reset(self):
        self._pending = np.empty(0, dtype=np.float32)
        self._context = np.zeros((1, 64), dtype=np.float32)
        self._state = np.zeros((2, 1, 128), dtype=np.float32)
        self._last = None

    def feed(self, pcm):
        if not isinstance(pcm, bytes) or len(pcm) != 640:
            raise ValueError('Expected one 20 ms mono 16 kHz PCM16 frame')
        samples = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
        self._pending = np.concatenate((self._pending, samples))
        if len(self._pending) >= 512:
            frame, self._pending = self._pending[:512], self._pending[512:]
            data = np.concatenate((self._context, frame.reshape(1, -1)), axis=1)
            output, self._state = self._session.run(None, {'input':data, 'state':self._state, 'sr':np.array(16000, dtype=np.int64)})
            self._context = data[:, -64:]
            probability = float(output[0, 0])
            if not np.isfinite(probability) or not 0 <= probability <= 1:
                raise RuntimeError('VAD returned an invalid probability')
            self._last = probability
        return self._last
