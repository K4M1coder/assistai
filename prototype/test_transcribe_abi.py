import ctypes
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('transcribe_abi', Path(__file__).resolve().parents[1] / 'scripts' / 'transcribe_abi.py')
abi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(abi)


class Function:
    def __init__(self, callback): self.callback = callback
    def __call__(self, argument): return self.callback(argument)


class TranscribeAbiTests(unittest.TestCase):
    def test_mismatched_or_unknown_layout_is_rejected(self):
        sizes = {identifier:ctypes.sizeof(cls) for identifier, cls in abi.STRUCTURES}
        aligns = {identifier:ctypes.alignment(cls) for identifier, cls in abi.STRUCTURES}
        library = type('Library', (), {})()
        library.transcribe_abi_struct_size = Function(lambda identifier:sizes[identifier])
        library.transcribe_abi_struct_align = Function(lambda identifier:aligns[identifier])
        abi.verify_layout(library)
        sizes[1] += 1
        with self.assertRaisesRegex(RuntimeError, 'SessionParams'): abi.verify_layout(library)
        sizes[1] = 0
        with self.assertRaisesRegex(RuntimeError, 'SessionParams'): abi.verify_layout(library)


if __name__ == '__main__': unittest.main()
