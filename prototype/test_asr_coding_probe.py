import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('asr_coding_probe', Path(__file__).resolve().parents[1] / 'scripts' / 'probe-asr-coding.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class AsrCodingProbeTests(unittest.TestCase):
    def test_word_error_is_case_and_accent_insensitive(self):
        self.assertEqual(probe.word_error('Écris le fichier', 'ecris le fichier'), 0)
        self.assertEqual(probe.word_error('ne supprime pas', 'supprime'), 2 / 3)
        self.assertIsNone(probe.word_error('', 'text'))


if __name__ == '__main__': unittest.main()
