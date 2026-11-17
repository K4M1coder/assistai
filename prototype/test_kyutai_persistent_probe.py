import contextlib
import importlib.util
import io
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
    def test_reuses_same_audio_and_stops_owned_server(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'model'; file.touch()
            process = FakeProcess(); uploads = []
            def post(url, **kwargs):
                uploads.append(kwargs['files']['file'][1])
                return Response({'text':'deux plus trois'})
            with patch.object(probe, 'EXECUTABLE', file), patch.object(probe, 'MODEL', file), \
                 patch.object(probe, 'synthetic_wav', return_value=b'synthetic'), \
                 patch.object(probe, 'cold_transcribe', return_value=('cold result', 100)), \
                 patch.object(probe.subprocess, 'Popen', return_value=process), \
                 patch.object(probe.requests, 'get', return_value=Response({'status':'ok'})), \
                 patch.object(probe.requests, 'post', side_effect=post), contextlib.redirect_stdout(io.StringIO()):
                probe.main()
            self.assertEqual(uploads, [b'synthetic', b'synthetic'])
            self.assertEqual(process.returncode, 0)


if __name__ == '__main__':
    unittest.main()
