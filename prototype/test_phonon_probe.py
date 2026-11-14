import unittest

import numpy as np

from prototype.phonon_probe import measure_stream


class FakeStream:
    def __init__(self, chunks):
        self.chunks = iter(chunks)
        self.closed = False

    def __iter__(self):
        return self.chunks

    def close(self):
        self.closed = True


class FakeModel:
    sample_rate = 4

    def __init__(self, chunks):
        self.last_stream = FakeStream(chunks)

    def stream(self, text):
        return self.last_stream


class ProbeTest(unittest.TestCase):
    def test_stream_and_interruption_close_resources(self):
        model = FakeModel([np.ones(4), np.ones(4)])
        result = measure_stream(model, 'synthetic')
        self.assertEqual(result['chunks'], 2)
        self.assertEqual(result['audio_seconds'], 2)
        self.assertTrue(model.last_stream.closed)
        model = FakeModel([np.ones(4), np.ones(4)])
        result = measure_stream(model, 'synthetic', interrupt_after_first=True)
        self.assertEqual(result['chunks'], 1)
        self.assertTrue(model.last_stream.closed)

    def test_invalid_audio_still_closes_stream(self):
        model = FakeModel([np.array([np.nan])])
        with self.assertRaises(ValueError):
            measure_stream(model, 'synthetic')
        self.assertTrue(model.last_stream.closed)


if __name__ == '__main__':
    unittest.main()
