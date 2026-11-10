"""Enumerate GGML devices in the experimental native build without loading a model."""
import ctypes
import json
import os
from pathlib import Path

directory = Path(__file__).resolve().parents[1] / '.cache/llama-cpp-omni-build/bin/Release'
dll_search = os.add_dll_directory(str(directory))
library = ctypes.CDLL(str(directory / 'ggml.dll'))
base = ctypes.CDLL(str(directory / 'ggml-base.dll'))
library.ggml_backend_load_all_from_path.argtypes = [ctypes.c_char_p]
library.ggml_backend_dev_count.restype = ctypes.c_size_t
library.ggml_backend_dev_get.argtypes = [ctypes.c_size_t]
library.ggml_backend_dev_get.restype = ctypes.c_void_p
for name in ('ggml_backend_dev_name', 'ggml_backend_dev_description'):
    function = getattr(base, name)
    function.argtypes = [ctypes.c_void_p]
    function.restype = ctypes.c_char_p
library.ggml_backend_load_all_from_path(os.fsencode(directory))
devices = []
for i in range(library.ggml_backend_dev_count()):
    device = library.ggml_backend_dev_get(i)
    devices.append({'name': base.ggml_backend_dev_name(device).decode('utf-8'),
                    'description': base.ggml_backend_dev_description(device).decode('utf-8')})
print(json.dumps({'devices': devices}))
