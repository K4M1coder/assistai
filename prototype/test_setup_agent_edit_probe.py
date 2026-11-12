import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'setup-agent-edit-probe.py'


class SetupAgentEditProbeTests(unittest.TestCase):
    def run_setup(self, workspace, url='http://127.0.0.1:18080/v1'):
        env = {**os.environ, 'ASSISTAI_PROBE_WORKSPACE': str(workspace), 'LOCAL_MODEL_URL': url}
        return subprocess.run([sys.executable, '-I', str(SCRIPT)], cwd=ROOT, env=env, capture_output=True, text=True)

    def test_creates_local_fixture_once_without_overwriting(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as temp:
            workspace = Path(temp) / 'fixture'
            self.assertEqual(self.run_setup(workspace).returncode, 0)
            self.assertEqual(json.loads((workspace / 'opencode.json').read_text())['provider']['local']['options']['baseURL'], 'http://127.0.0.1:18080/v1')
            (workspace / 'calculator.py').write_text('preserve me', encoding='utf-8')
            self.assertNotEqual(self.run_setup(workspace).returncode, 0)
            self.assertEqual((workspace / 'calculator.py').read_text(), 'preserve me')

    def test_rejects_nonlocal_endpoint_before_creating_workspace(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as temp:
            for index, url in enumerate(('https://example.com/v1', 'http://user@localhost/v1')):
                workspace = Path(temp) / str(index)
                self.assertNotEqual(self.run_setup(workspace, url).returncode, 0)
                self.assertFalse(workspace.exists())


if __name__ == '__main__':
    unittest.main()
