"""Check that the synthetic visual fixtures actually have the intended colors."""
import importlib.util
from pathlib import Path
import struct
import unittest
import zlib

spec = importlib.util.spec_from_file_location('spoken_image', Path(__file__).resolve().parents[1] / 'scripts/probe-spoken-image.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SyntheticImageTests(unittest.TestCase):
    def test_solid_png_pixel_data(self):
        for rgb in ((255, 0, 0), (0, 0, 255)):
            image = probe.solid_png(rgb)
            self.assertEqual(image[:8], b'\x89PNG\r\n\x1a\n')
            offset = 8
            while offset < len(image):
                size = struct.unpack_from('>I', image, offset)[0]
                kind = image[offset + 4:offset + 8]
                payload = image[offset + 8:offset + 8 + size]
                if kind == b'IDAT':
                    self.assertEqual(zlib.decompress(payload), (b'\0' + bytes(rgb) * 64) * 64)
                    break
                offset += size + 12
            else:
                self.fail('PNG has no image data')


if __name__ == '__main__':
    unittest.main()
