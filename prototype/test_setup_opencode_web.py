import json
import tempfile
import unittest
from pathlib import Path

from scripts.setup_opencode_web import setup


class SetupTest(unittest.TestCase):
    def test_fixture_denies_unlisted_tools_and_does_not_overwrite(self):
        cache = Path(__file__).resolve().parents[1] / '.cache'
        with tempfile.TemporaryDirectory(dir=cache, prefix='web-setup-test-') as directory:
            workspace = Path(directory) / 'fixture'
            setup(workspace)
            config = json.loads((workspace / 'opencode.json').read_text(encoding='utf-8'))
            self.assertEqual(config['provider']['local']['options']['baseURL'], 'http://127.0.0.1:18080/v1')
            self.assertEqual(config['permission'], {'*':'deny', 'websearch':'allow', 'webfetch':'allow', 'external_directory':'deny'})
            with self.assertRaises(FileExistsError): setup(workspace)

    def test_refuses_path_outside_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError): setup(Path(directory) / 'outside')


if __name__ == '__main__':
    unittest.main()
