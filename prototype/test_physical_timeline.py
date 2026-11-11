import importlib.util
from pathlib import Path
import unittest

import numpy as np

path = Path(__file__).resolve().parents[1] / 'scripts/probe-localvqe-physical.py'
spec = importlib.util.spec_from_file_location('localvqe_physical_probe', path)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class PhysicalTimelineTests(unittest.TestCase):
    def test_contiguous_mapping_does_not_insert_callback_jitter_gaps(self):
        frames = [(1.0, np.ones(320, dtype='<i2') * 1000),
                  (1.025, np.ones(320, dtype='<i2') * 2000)]
        continuous = probe.reconstruct(frames, 1.0, 800, per_callback=False)
        timestamps = probe.reconstruct(frames, 1.0, 800, per_callback=True)
        self.assertEqual(continuous[319], 1000 / 32768)
        self.assertEqual(continuous[320], 2000 / 32768)
        self.assertEqual(timestamps[320], 0)
        self.assertEqual(timestamps[400], 2000 / 32768)


if __name__ == '__main__': unittest.main()
