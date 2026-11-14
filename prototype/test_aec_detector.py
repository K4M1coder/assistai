import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('aec_detector', Path('scripts/evaluate-aec-detector.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class AecDetectorTest(unittest.TestCase):
    def test_requires_three_consecutive_frames(self):
        frames = np.zeros((8, probe.FRAME), dtype=np.float32)
        frames[1:3] = 0.2
        frames[4:7] = 0.2
        self.assertEqual(probe.onset_times(frames.ravel(), 0.1, 0, 0.16), [0.14])


if __name__ == '__main__':
    unittest.main()
