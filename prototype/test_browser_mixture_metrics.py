import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('mixture_probe', Path('scripts/probe-browser-mixture-extraction.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class CorrelationTest(unittest.TestCase):
    def test_detects_lag_and_silent_signal(self):
        reference = np.zeros(10000, dtype=np.float32)
        reference[4000:4004] = [1, -0.5, 0.25, -0.125]
        shifted = np.roll(reference, 160)
        result = probe.peak_correlation(shifted, reference)
        self.assertAlmostEqual(result['coefficient'], 1, places=4)
        self.assertEqual(result['lag_ms'], 10)
        self.assertEqual(probe.peak_correlation(reference * 0, reference)['coefficient'], 0)


if __name__ == '__main__':
    unittest.main()
