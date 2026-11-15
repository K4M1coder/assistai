import json
import tempfile
import unittest
from pathlib import Path

from scripts.setup_opencode_readonly import setup


class SetupTest(unittest.TestCase):
    def test_fixture_is_local_read_only_and_not_overwritten(self):
        cache = Path(__file__).resolve().parents[1] / '.cache'
        with tempfile.TemporaryDirectory(dir=cache, prefix='readonly-setup-test-') as directory:
            workspace = Path(directory) / 'fixture'
            setup(workspace)
            config = json.loads((workspace / 'opencode.json').read_text(encoding='utf-8'))
            self.assertEqual(config['provider']['local']['options']['baseURL'], 'http://127.0.0.1:18080/v1')
            self.assertEqual(config['permission'], {'*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow'})
            self.assertIn('BLUEBIRD', (workspace / 'fixture.txt').read_text(encoding='utf-8'))
            with self.assertRaises(FileExistsError):
                setup(workspace)

    def test_refuses_path_outside_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                setup(Path(directory) / 'outside')


if __name__ == '__main__':
    unittest.main()
