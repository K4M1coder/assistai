"""Meaningful signal and packet-boundary checks for native playback conversion."""
import unittest

import numpy as np
import soxr

from prototype.native_pcm import PcmRateConverter


class NativePcmTests(unittest.TestCase):
    def test_irregular_packets_preserve_stream_and_flush(self):
        rate = 24000
        signal = (20000 * np.sin(2 * np.pi * 440 * np.arange(rate) / rate)).astype('<i2')
        pcm = signal.tobytes()
        converter = PcmRateConverter(24000, 16000)
        output = bytearray()
        for offset in range(0, len(pcm), 357):
            output.extend(converter.process(pcm[offset:offset + 357]))
        output.extend(converter.process(b'', final=True))
        result = np.frombuffer(output, dtype='<i2')
        reference = soxr.resample(signal, 24000, 16000, quality='HQ')
        self.assertEqual(len(result), len(reference))
        # Separate integer conversions may differ by a few least-significant bits.
        self.assertLessEqual(np.max(np.abs(result.astype(np.int32) - reference.astype(np.int32))), 3)
        with self.assertRaises(RuntimeError): converter.process(b'')
        converter.reset()
        self.assertEqual(len(converter.process(b'', final=True)), 0)

    def test_rejects_truncated_final_sample(self):
        converter = PcmRateConverter(24000, 16000)
        converter.process(b'\x00')
        with self.assertRaises(ValueError): converter.process(b'', final=True)


if __name__ == '__main__':
    unittest.main()
