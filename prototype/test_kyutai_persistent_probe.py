import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('persistent_probe', Path(__file__).resolve().parents[1] / 'scripts/probe-kyutai-persistent.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class FakeProcess:
    returncode = None
    def poll(self): return self.returncode
    def terminate(self): self.returncode = 0
    def wait(self, timeout=None): return self.returncode


class Response:
    ok = True
    def __init__(self, data): self.data = data
    def json(self): return self.data
    def raise_for_status(self): pass


class PersistentProbeTests(unittest.TestCase):
    def test_compares_original_and_control_and_stops_owned_server(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'model'; file.touch()
            process = FakeProcess(); uploads = []
            def post(url, **kwargs):
                uploads.append(kwargs['files']['file'][1])
                return Response({'text':'' if len(uploads) == 1 else 'deux plus trois'})
            with patch.object(probe, 'EXECUTABLE', file), patch.object(probe, 'MODEL', file), patch('sys.argv', ['probe']), \
                 patch.object(probe, 'synthetic_wav', return_value=b'synthetic'), \
                 patch.object(probe, 'rate_mismatch_control', return_value=b'converted'), \
                 patch.object(probe, 'cold_transcribe', return_value=('cold result', 100)), \
                 patch.object(probe.subprocess, 'Popen', return_value=process), \
                 patch.object(probe.requests, 'get', return_value=Response({'status':'ok'})), \
                 patch.object(probe.requests, 'post', side_effect=post), contextlib.redirect_stdout(io.StringIO()) as output:
                probe.main()
            self.assertEqual(uploads, [b'synthetic', b'converted'])
            self.assertEqual(json.loads(output.getvalue())['runs'][0]['text'], '')
            self.assertEqual(process.returncode, 0)

    def test_fixed_fixture_is_reused_without_resynthesizing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); (root / '.cache').mkdir()
            file = root / 'model'; file.touch()
            uploads = []
            def post(url, **kwargs):
                uploads.append(kwargs['files']['file'][1])
                return Response({'text':'deux plus trois'})
            with patch.object(probe, 'ROOT', root), patch.object(probe, 'EXECUTABLE', file), \
                 patch.object(probe, 'MODEL', file), patch('sys.argv', ['probe', '--fixed-synthetic-fixture']), \
                 patch.object(probe, 'synthetic_wav', return_value=b'fixed') as synthesize, \
                 patch.object(probe, 'rate_mismatch_control', return_value=b'converted'), \
                 patch.object(probe, 'cold_transcribe', return_value=('cold result', 100)), \
                 patch.object(probe.subprocess, 'Popen', side_effect=lambda *a, **k: FakeProcess()), \
                 patch.object(probe.requests, 'get', return_value=Response({'status':'ok'})), \
                 patch.object(probe.requests, 'post', side_effect=post), contextlib.redirect_stdout(io.StringIO()) as result:
                probe.main(); probe.main()
            self.assertEqual(synthesize.call_count, 1)
            self.assertEqual(uploads, [b'fixed', b'converted', b'fixed', b'converted'])
            self.assertIn('"fixture_reused": true', result.getvalue())

    def test_control_changes_sample_count_but_keeps_label(self):
        import wave
        source = io.BytesIO()
        with wave.open(source, 'wb') as audio:
            audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(16000); audio.writeframes(bytes(3200))
        with wave.open(io.BytesIO(probe.rate_mismatch_control(source.getvalue())), 'rb') as audio:
            self.assertEqual(audio.getframerate(), 16000)
            self.assertEqual(audio.getnframes(), 2400)


if __name__ == '__main__':
    unittest.main()
