"""Streaming PCM conversion for an experimental native audio client."""
import numpy as np
import soxr


class PcmRateConverter:
    """Convert mono little-endian PCM16 without dropping odd packet boundaries."""

    def __init__(self, input_rate: int, output_rate: int):
        if input_rate <= 0 or output_rate <= 0:
            raise ValueError('Sample rates must be positive')
        self.input_rate = input_rate
        self.output_rate = output_rate
        self.reset()

    def reset(self):
        self._stream = soxr.ResampleStream(self.input_rate, self.output_rate, 1, dtype='int16', quality='HQ')
        self._pending = b''
        self._finished = False

    def process(self, pcm: bytes, *, final: bool = False) -> bytes:
        if self._finished:
            raise RuntimeError('Create or reset the converter for the next response')
        data = self._pending + pcm
        if final and len(data) % 2:
            raise ValueError('Incomplete PCM16 sample at end of stream')
        size = len(data) - len(data) % 2
        self._pending = data[size:]
        samples = np.frombuffer(data[:size], dtype='<i2').astype(np.int16, copy=False)
        output = self._stream.resample_chunk(samples, last=final)
        self._finished = final
        return output.astype('<i2', copy=False).tobytes()
