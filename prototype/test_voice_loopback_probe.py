import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('voice_loopback', Path(__file__).resolve().parents[1] / 'scripts/probe-voice-loopback.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class VoiceLoopbackTests(unittest.TestCase):
    def test_expected_answer_requires_a_whole_normalized_token(self):
        self.assertTrue(probe.expected_answer_present('La réponse est CINQ.', {'cinq', '5'}))
        self.assertFalse(probe.expected_answer_present('La réponse est cinquante.', {'cinq', '5'}))
        self.assertFalse(probe.expected_answer_present('Je ne comprends pas.', {'cinq', '5'}))


if __name__ == '__main__':
    unittest.main()
