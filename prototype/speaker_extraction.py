"""Framing adapter for a stateful 16 kHz speaker-extraction stream.

Call feed from a worker, never from an audio callback or event-loop thread.
This component does not create or enroll a model and is not wired into the client.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor

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


class ExtractionWorker:
    """Single in-flight extraction call; the caller must bound upstream capture.

    Cancellation invalidates the stream: running native inference cannot be
    forcibly cancelled safely, and its result must never enter a later turn.
    """

    def __init__(self, framer):
        self._framer = framer
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='speaker-extraction')
        self._inflight = None
        self._closed = False
        self._busy = False

    async def feed(self, frame):
        if self._closed:
            raise RuntimeError('Extraction worker is closed')
        if self._busy:
            raise OverflowError('Extraction worker already has an in-flight frame')
        self._busy = True
        try:
            self._inflight = asyncio.get_running_loop().run_in_executor(self._executor, self._framer.feed, frame)
            result = await asyncio.shield(self._inflight)
            if self._closed:
                raise RuntimeError('Extraction worker is closed')
            return result
        except BaseException:
            self._closed = True
            raise
        finally:
            self._busy = False

    async def close(self):
        self._closed = True
        try:
            if self._inflight is not None:
                try:
                    await asyncio.shield(self._inflight)
                except Exception:
                    pass
        finally:
            self._executor.shutdown(wait=False, cancel_futures=True)
