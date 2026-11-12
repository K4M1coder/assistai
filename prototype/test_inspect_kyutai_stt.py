import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('inspect_kyutai_stt', Path(__file__).resolve().parents[1] / 'scripts' / 'inspect-kyutai-stt.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class InspectKyutaiSttTests(unittest.TestCase):
    def test_reports_missing_assets_without_loading(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'config.json').write_text(json.dumps({'mimi_name':'mimi.safetensors','tokenizer_name':'tokenizer.model','stt_config':{'audio_delay_seconds':0.5}}))
            (root / 'model.gguf').write_bytes(b'1234')
            result = probe.inspect(root)
            self.assertEqual(result['gguf'][0]['bytes'], 4)
            self.assertFalse(result['assets']['mimi_name']['present'])
            self.assertFalse(result['model_loaded'])
            self.assertFalse(result['network_used'])

    def test_rejects_escaping_asset_name(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'config.json').write_text(json.dumps({'mimi_name':'../secret','tokenizer_name':'tokenizer.model'}))
            with self.assertRaises(ValueError): probe.inspect(root)


if __name__ == '__main__': unittest.main()
