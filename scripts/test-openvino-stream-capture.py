"""Component tests only; do not load an OpenVINO model or open audio devices."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

import numpy as np
import openvino_genai as genai

spec = importlib.util.spec_from_file_location('stream_capture', Path(__file__).with_name('openvino-stream-capture.py'))
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class CaptureTests(unittest.TestCase):
    def test_copies_audio_and_stops_on_request(self):
        source = np.array([[[0.1, -0.2]]], dtype=np.float32)
        capture = module.StreamCapture(stop_after_first=True)
        self.assertEqual(capture(SimpleNamespace(data=source)), genai.StreamingStatus.STOP)
        source[:] = 0
        self.assertGreater(float(capture.chunks[0][0]), 0)
        self.assertEqual(capture.samples, 2)
        self.assertIsNotNone(capture.first_ms)

    def test_rejects_invalid_or_excess_samples(self):
        capture = module.StreamCapture(max_samples=2)
        self.assertEqual(capture(SimpleNamespace(data=np.array([0.1, 0.2]))), genai.StreamingStatus.RUNNING)
        with self.assertRaises(OverflowError): capture(SimpleNamespace(data=np.array([0.3])))
        with self.assertRaises(ValueError): module.StreamCapture()(SimpleNamespace(data=np.array([np.nan])))


if __name__ == '__main__': unittest.main()
