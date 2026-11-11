from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import wave

from prototype.enroll_speaker import record


class FakeStream:
    def __init__(self, *, overflow=False, **kwargs):
        self.overflow = overflow

    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, frames): return bytes(frames * 2), self.overflow


class FakeSoundDevice:
    overflow = False
    opened = False

    def query_hostapis(self): return [{'name': 'Windows WASAPI', 'default_input_device': 0}]
    def WasapiSettings(self, **kwargs): return kwargs
    def RawInputStream(self, **kwargs):
        self.opened = True
        return FakeStream(overflow=self.overflow, **kwargs)


class EnrollmentTests(unittest.TestCase):
    def test_writes_expected_format_without_real_devices(self):
        with tempfile.TemporaryDirectory() as directory, patch('prototype.enroll_speaker.sys.platform', 'win32'):
            path = Path(directory) / 'voice.wav'
            record(path, 3, FakeSoundDevice())
            with wave.open(str(path), 'rb') as wav:
                self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()),
                                 (1, 2, 16000, 48000))

    def test_existing_file_is_untouched_and_device_not_opened(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'voice.wav'
            path.write_bytes(b'original')
            device = FakeSoundDevice()
            with self.assertRaises(FileExistsError): record(path, 3, device)
            self.assertFalse(device.opened)
            self.assertEqual(path.read_bytes(), b'original')

    def test_capture_overflow_does_not_write_file(self):
        with tempfile.TemporaryDirectory() as directory, patch('prototype.enroll_speaker.sys.platform', 'win32'):
            path = Path(directory) / 'voice.wav'
            device = FakeSoundDevice()
            device.overflow = True
            with self.assertRaisesRegex(RuntimeError, 'overflowed'): record(path, 3, device)
            self.assertFalse(path.exists())


if __name__ == '__main__':
    unittest.main()
