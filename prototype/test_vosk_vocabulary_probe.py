import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('vocabulary_probe', Path(__file__).resolve().parents[1] / 'scripts/probe-vosk-vocabulary.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class VocabularyProbeTests(unittest.TestCase):
    def test_interprets_missing_word_id(self):
        class Model:
            def vosk_model_find_word(self, word):
                return {'known': 7, 'missing': -1}[word]
        self.assertEqual(probe.check_words(Model(), ['known', 'missing']), {'known': True, 'missing': False})


if __name__ == '__main__':
    unittest.main()
