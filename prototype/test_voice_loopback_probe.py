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

    def test_short_answer_check_rejects_token_in_irrelevant_example(self):
        self.assertTrue(probe.straightforward_answer('Deux plus trois fait cinq.', 'math'))
        self.assertTrue(probe.straightforward_answer('La capitale de la France est Paris.', 'capital'))
        self.assertFalse(probe.straightforward_answer('Je ne peux pas répondre. Par exemple : 5 + 3.', 'math'))
        self.assertFalse(probe.straightforward_answer('La capitale ne serait pas Paris.', 'capital'))

    def test_input_intent_rejects_changed_arithmetic(self):
        self.assertTrue(probe.input_intent_preserved('combien font deux plus trois réponds en un mot', 'math'))
        self.assertFalse(probe.input_intent_preserved('combien font de plus trois répond en amont', 'math'))


if __name__ == '__main__':
    unittest.main()
