import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('echo_probe', Path('scripts/probe-echoless-offline.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class EchoMetricsTest(unittest.TestCase):
    def test_known_synthetic_near_signal(self):
        samples = np.arange(12 * probe.RATE, dtype=np.float32)
        near = np.zeros_like(samples)
        near[7 * probe.RATE:] = np.sin(samples[7 * probe.RATE:] * 0.037)
        mic = near.copy()
        mic[3 * probe.RATE:6 * probe.RATE] = 0.5
        result = probe.measure(mic, near, near)
        self.assertGreater(result['echo_only_reduction_db'], 100)
        self.assertAlmostEqual(result['doubletalk_near_correlation'], 1.0, places=3)
        self.assertAlmostEqual(result['output_to_near_rms'], 1.0, places=3)


if __name__ == '__main__':
    unittest.main()
