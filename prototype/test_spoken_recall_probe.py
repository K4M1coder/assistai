import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'scripts/probe-spoken-session-recall.py'
spec = importlib.util.spec_from_file_location('spoken_recall_probe', path)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SpokenRecallProbeTests(unittest.TestCase):
    def test_accepts_only_the_requested_word(self):
        self.assertTrue(probe.exact_answer('Rouge.', 'rouge'))
        self.assertFalse(probe.exact_answer('Je ne connais pas le mot « rouge ».', 'rouge'))
        self.assertFalse(probe.exact_answer('Rouge ou bleu', 'rouge'))


if __name__ == '__main__': unittest.main()
