"""Minimal pinned transcribe.cpp 0.4.2 ABI layouts; no model loading."""
import ctypes


class ModelLoadParams(ctypes.Structure):
    _fields_ = [('struct_size', ctypes.c_uint64), ('backend', ctypes.c_int),
                ('device', ctypes.c_void_p), ('no_mmap', ctypes.c_bool)]


class SessionParams(ctypes.Structure):
    _fields_ = [('struct_size', ctypes.c_uint64), ('n_threads', ctypes.c_int),
                ('kv_type', ctypes.c_int), ('n_ctx', ctypes.c_int32)]


class StreamText(ctypes.Structure):
    _fields_ = [('struct_size', ctypes.c_uint64), ('full_text', ctypes.c_void_p),
                ('full_text_bytes', ctypes.c_uint64), ('committed_text', ctypes.c_void_p),
                ('committed_text_bytes', ctypes.c_uint64), ('tentative_text', ctypes.c_void_p),
                ('tentative_text_bytes', ctypes.c_uint64), ('raw_tentative_start_bytes', ctypes.c_uint64)]


STRUCTURES = ((0, ModelLoadParams), (1, SessionParams), (10, StreamText))


def verify_layout(lib):
    lib.transcribe_abi_struct_size.argtypes = [ctypes.c_int]
    lib.transcribe_abi_struct_size.restype = ctypes.c_size_t
    lib.transcribe_abi_struct_align.argtypes = [ctypes.c_int]
    lib.transcribe_abi_struct_align.restype = ctypes.c_size_t
    for identifier, structure in STRUCTURES:
        size = lib.transcribe_abi_struct_size(identifier)
        align = lib.transcribe_abi_struct_align(identifier)
        if not size or not align or size != ctypes.sizeof(structure) or align != ctypes.alignment(structure):
            raise RuntimeError(f'Incompatible ABI layout: {structure.__name__}')
