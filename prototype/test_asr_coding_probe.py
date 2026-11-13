import importlib.util
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('asr_coding_probe', Path(__file__).resolve().parents[1] / 'scripts' / 'probe-asr-coding.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class AsrCodingProbeTests(unittest.TestCase):
    def test_word_error_is_case_and_accent_insensitive(self):
        self.assertEqual(probe.word_error('Écris le fichier', 'ecris le fichier'), 0)
        self.assertEqual(probe.word_error('ne supprime pas', 'supprime'), 2 / 3)
        self.assertIsNone(probe.word_error('', 'text'))

    def test_candidate_receives_synthetic_wav_and_cleans_it_up(self):
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / 'model.gguf'; model.write_bytes(b'model')
            captured = {}
            def fake_run(args, **kwargs):
                path = Path(args[args.index('-f') + 1]); captured['path'] = path
                self.assertTrue(path.read_bytes().startswith(b'RIFF'))
                self.assertIn('-ng', args)
                self.assertEqual(args[args.index('--lid-backend') + 1], 'off')
                self.assertEqual(args[args.index('-l') + 1], 'fr')
                self.assertEqual(kwargs['stdin'], probe.subprocess.DEVNULL)
                return SimpleNamespace(returncode=0, stdout='Bonjour', stderr='')
            with patch.object(probe.subprocess, 'run', side_effect=fake_run):
                text, _ = probe.recognize_crisp(b'\x00\x00' * 320, Path(sys.executable), model)
            self.assertEqual(text, 'Bonjour')
            self.assertFalse(captured['path'].exists())

    def test_timeout_preserves_diagnostics_and_removes_wav(self):
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / 'model.gguf'; model.write_bytes(b'model'); captured = {}
            def fake_run(args, **kwargs):
                captured['path'] = Path(args[args.index('-f') + 1])
                raise probe.subprocess.TimeoutExpired(args, 45, stderr=b'missing model prompt')
            with patch.object(probe.subprocess, 'run', side_effect=fake_run):
                with self.assertRaisesRegex(RuntimeError, 'missing model prompt'):
                    probe.recognize_crisp(b'\x00\x00' * 320, Path(sys.executable), model)
            self.assertFalse(captured['path'].exists())


if __name__ == '__main__': unittest.main()
