"""Check the pinned transcribe.cpp CPU backend without opening a model or audio device."""
import ctypes
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / '.cache/transcribe-v0.4.2-windows-cpu-vulkan/transcribe-native-windows-x86_64-cpu-vulkan'


def main():
    if os.name != 'nt': raise RuntimeError('This research probe targets the pinned Windows binary')
    contract = json.loads((DIRECTORY / 'contract.json').read_text(encoding='utf-8'))
    if contract.get('version') != '0.4.2' or contract.get('header_hash') != 'f99ad4169374b8f3':
        raise RuntimeError('Unexpected native runtime contract')
    os.environ['TRANSCRIBE_BACKENDS'] = 'cpu'
    with os.add_dll_directory(str(DIRECTORY.resolve())):
        lib = ctypes.CDLL(str((DIRECTORY / 'transcribe.dll').resolve()))
        lib.transcribe_version.restype = ctypes.c_char_p
        lib.transcribe_version_commit.restype = ctypes.c_char_p
        lib.transcribe_init_backends_default.restype = ctypes.c_int
        lib.transcribe_device_count.restype = ctypes.c_int
        lib.transcribe_backend_available.argtypes = [ctypes.c_int]
        lib.transcribe_backend_available.restype = ctypes.c_bool
        version = lib.transcribe_version().decode('ascii')
        if version != contract['version']: raise RuntimeError('Native runtime version mismatch')
        result = lib.transcribe_init_backends_default()
        devices = lib.transcribe_device_count()
        cpu = bool(lib.transcribe_backend_available(1))
        if result != 0 or not cpu or devices < 1: raise RuntimeError('CPU backend initialization failed')
        print(json.dumps({'version':version, 'commit':lib.transcribe_version_commit().decode('ascii'),
                          'devices':devices, 'cpu_available':cpu, 'vulkan_initialized':False,
                          'model_loaded':False, 'audio_devices_opened':False}))


if __name__ == '__main__': main()
