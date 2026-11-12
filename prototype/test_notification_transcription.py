import importlib.util
from pathlib import Path
import unittest

script = Path(__file__).resolve().parents[1] / 'scripts' / 'probe-notification-transcription.py'
spec = importlib.util.spec_from_file_location('notification_transcription', script)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class NotificationTranscriptionTests(unittest.TestCase):
    def test_marker_requires_a_complete_word(self):
        self.assertTrue(probe.contains_marker('le résultat est ROUGE', 'rouge'))
        self.assertFalse(probe.contains_marker('le résultat est rougeâtre', 'rouge'))
        self.assertFalse(probe.contains_marker('le résultat est aimant', 'mangue'))


if __name__ == '__main__': unittest.main()
