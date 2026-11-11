import unittest

import numpy as np

from prototype.silero_vad import SileroSpeechDetector


class FakeSession:
    def __init__(self): self.inputs = []
    def run(self, _, data):
        self.inputs.append(data)
        return np.array([[0.75]], dtype=np.float32), data['state'] + 1


class SileroVadTests(unittest.TestCase):
    def test_windows_state_and_reset(self):
        session = FakeSession()
        vad = SileroSpeechDetector('unused', session=session)
        frame = np.full(320, 1000, dtype='<i2').tobytes()
        self.assertIsNone(vad.feed(frame))
        self.assertAlmostEqual(vad.feed(frame), 0.75)
        self.assertAlmostEqual(vad.feed(frame), 0.75)
        self.assertEqual(len(session.inputs), 1)
        self.assertEqual(session.inputs[0]['input'].shape, (1, 576))
        vad.feed(frame)
        self.assertEqual(len(session.inputs), 2)
        self.assertTrue(np.all(session.inputs[1]['state'] == 1))
        vad.reset()
        self.assertIsNone(vad.feed(frame))
        self.assertAlmostEqual(vad.feed(frame), 0.75)
        self.assertTrue(np.all(session.inputs[2]['state'] == 0))

    def test_bad_frames_rejected(self):
        with self.assertRaises(ValueError): SileroSpeechDetector('unused', session=FakeSession()).feed(bytes(639))


if __name__ == '__main__': unittest.main()
