import unittest
import numpy as np

from prototype.reference_delay import estimate_delay


class ReferenceDelayTests(unittest.TestCase):
    def test_recovers_delayed_noise_with_attenuation(self):
        rng = np.random.default_rng(42)
        ref = rng.normal(0, .1, 48000)
        mic = np.zeros_like(ref)
        mic[11200:] = .3 * ref[:-11200]
        result = estimate_delay(ref, mic)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['delay_samples'], 11200)

    def test_silence_is_rejected(self):
        result = estimate_delay(np.zeros(48000), np.zeros(48000))
        self.assertFalse(result['accepted'])
        self.assertIsNone(result['delay_samples'])

    def test_rejects_ambiguous_periodic_calibration(self):
        ref = np.tile(np.array([1., -1.]), 24000)
        result = estimate_delay(ref, ref)
        self.assertFalse(result['accepted'])

    def test_rejects_nonfinite_or_short_inputs(self):
        with self.assertRaises(ValueError): estimate_delay(np.zeros(10), np.zeros(10))
        ref = np.zeros(16000)
        ref[0] = np.nan
        with self.assertRaises(ValueError): estimate_delay(ref, np.zeros(16000))
