"""Framing adapter for a stateful 16 kHz speaker-extraction stream.

Call feed from a worker, never from an audio callback or event-loop thread.
This component does not create or enroll a model and is not wired into the client.
"""
import numpy as np


class ExtractionFramer:
    FRAME_SAMPLES = 320

    def __init__(self, stream, *, max_pending_samples=1600):
        if max_pending_samples < self.FRAME_SAMPLES:
            raise ValueError('Pending sample limit must hold at least one frame')
        self._stream = stream
        self._pending = np.empty(0, dtype=np.float32)
        self._limit = max_pending_samples
        self._failed = False

    def feed(self, pcm):
        if self._failed:
            raise RuntimeError('Extraction stream failed; create a new stream')
        if not isinstance(pcm, bytes) or len(pcm) != self.FRAME_SAMPLES * 2:
            raise ValueError('Expected one 20 ms mono 16 kHz PCM16 frame')
        try:
            samples = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
            output = np.asarray(self._stream.push(samples), dtype=np.float32)
            if output.ndim != 1 or not np.isfinite(output).all():
                raise ValueError('Invalid extractor output')
            if len(self._pending) + len(output) > self._limit:
                raise OverflowError('Extractor output exceeded pending sample limit')
            self._pending = np.concatenate((self._pending, output))
            frames = []
            while len(self._pending) >= self.FRAME_SAMPLES:
                samples = self._pending[:self.FRAME_SAMPLES]
                frames.append((np.clip(samples, -1, 32767 / 32768) * 32768).astype('<i2').tobytes())
                self._pending = self._pending[self.FRAME_SAMPLES:]
            return frames
        except Exception:
            self._failed = True
            self._pending = np.empty(0, dtype=np.float32)
            raise
