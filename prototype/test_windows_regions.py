import ctypes
import importlib.util
import os
from pathlib import Path
import sys
import unittest


@unittest.skipUnless(sys.platform == 'win32', 'Windows memory APIs required')
class WindowsRegionsTests(unittest.TestCase):
    def test_inspects_current_process_without_addresses_or_contents(self):
        script = Path(__file__).resolve().parents[1] / 'scripts' / 'inspect-windows-regions.py'
        spec = importlib.util.spec_from_file_location('windows_regions', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        buffer = ctypes.create_string_buffer(1024 * 1024)
        buffer[0] = b'x'
        result = module.inspect(os.getpid(), sample_residency=True)
        self.assertGreater(result['committed_by_type_bytes']['private'], len(buffer))
        self.assertTrue(all('sampled_pages' in item and item['sampled_valid'] <= item['sampled_pages'] for item in result['largest_allocations']))
        self.assertNotIn('address', repr(result).lower())


if __name__ == '__main__': unittest.main()
