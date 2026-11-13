import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('inspect_voxtral_cache', Path(__file__).resolve().parents[1] / 'scripts' / 'inspect-voxtral-cache.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def string(value):
    value = value.encode('utf-8')
    return struct.pack('<Q', len(value)) + value


class VoxtralCacheTests(unittest.TestCase):
    def test_reads_metadata_and_estimates_kv(self):
        values = [32, 32, 64, 26, 8, 128, 8192]
        entries = [string(probe.PREFIX + key) + struct.pack('<II', 4, value) for key, value in zip(probe.FIELDS, values)]
        # Array encoding is element type followed by element count.
        entries.append(string('tokenizer.tokens') + struct.pack('<IIQ', 9, 8, 1) + string('word'))
        payload = b'GGUF' + struct.pack('<IQQ', 3, 0, len(entries)) + b''.join(entries)
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'fixture.gguf'; file.write_bytes(payload)
            result = probe.inspect(file)
            self.assertEqual(result['encoder_kv_f32_bytes'], 805306368)
            self.assertEqual(result['decoder_kv_f16_bytes'], 872415232)
            self.assertFalse(result['weights_loaded'])

    def test_rejects_truncated_file(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'bad.gguf'; file.write_bytes(b'GGUF\x03')
            with self.assertRaisesRegex(ValueError, 'Truncated'): probe.inspect(file)


if __name__ == '__main__': unittest.main()
