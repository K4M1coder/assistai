"""Bounded PCM playback buffer for the experimental native audio path."""
from threading import Lock

from prototype.native_pcm import PcmRateConverter


class NativePlayback:
    """Resample response audio and discard queued or late data on interruption."""

    def __init__(self, input_rate=24000, output_rate=16000, max_buffer_seconds=3):
        if max_buffer_seconds <= 0:
            raise ValueError('Playback buffer duration must be positive')
        self.output_rate = output_rate
        self.max_bytes = int(output_rate * 2 * max_buffer_seconds)
        self._converter = PcmRateConverter(input_rate, output_rate)
        self._lock = Lock()
        self._data = bytearray()
        self._generation = 0
        self._receiving = False

    def begin(self):
        with self._lock:
            self._generation += 1
            self._data.clear()
            self._converter.reset()
            self._receiving = True
            return self._generation

    def _enqueue(self, data):
        if len(self._data) + len(data) > self.max_bytes:
            self._data.clear()
            self._receiving = False
            self._generation += 1
            raise BufferError('Native playback buffer exceeded its limit')
        self._data.extend(data)

    def append(self, generation, data):
        with self._lock:
            if generation != self._generation or not self._receiving:
                return False
            self._enqueue(self._converter.process(data))
            return True

    def finish(self, generation):
        with self._lock:
            if generation != self._generation or not self._receiving:
                return False
            try:
                self._enqueue(self._converter.process(b'', final=True))
            except (ValueError, BufferError):
                self._data.clear()
                self._receiving = False
                self._generation += 1
                raise
            self._receiving = False
            return True

    def interrupt(self):
        with self._lock:
            self._generation += 1
            self._receiving = False
            self._data.clear()

    def read_frames(self, frames):
        if not isinstance(frames, int) or frames < 0:
            raise ValueError('Frame count must be non-negative')
        size = frames * 2
        with self._lock:
            count = min(size, len(self._data))
            audio = bytes(self._data[:count])
            del self._data[:count]
        return audio + bytes(size - count)

    def active(self):
        with self._lock:
            return self._receiving or bool(self._data)

    def buffered_frames(self):
        with self._lock:
            return len(self._data) // 2
