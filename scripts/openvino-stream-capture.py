"""Bounded output callback for an experimental OpenVINO streaming probe."""
import time
from threading import Lock
import numpy as np
import openvino_genai as genai


class StreamCapture:
    def __init__(self, *, stop_after_first=False, max_samples=24000*60):
        self.started = time.monotonic()
        self.stop_after_first = stop_after_first
        self.max_samples = max_samples
        self.samples = 0
        self.first_ms = None
        self.chunks = []
        self.stopped = False
        self.discarded_after_stop = 0
        self._lock = Lock()

    def request_stop(self):
        with self._lock:
            self.stopped = True

    def __call__(self, tensor):
        with self._lock:
            if self.stopped:
                self.discarded_after_stop += 1
                return genai.StreamingStatus.STOP
            chunk = np.asarray(tensor.data, dtype=np.float32).reshape(-1).copy()
            if not chunk.size or not np.isfinite(chunk).all(): raise ValueError('Invalid streamed audio')
            if self.samples + len(chunk) > self.max_samples: raise OverflowError('Streamed audio exceeds limit')
            if self.first_ms is None: self.first_ms = round((time.monotonic() - self.started) * 1000)
            self.samples += len(chunk); self.chunks.append(chunk)
            if self.stop_after_first:
                self.stopped = True
                return genai.StreamingStatus.STOP
            return genai.StreamingStatus.RUNNING
