"""Read selected GGUF metadata and estimate streaming KV tensor bytes, without loading weights."""
import argparse
import json
from pathlib import Path
import struct

FORMATS = {0:'B', 1:'b', 2:'H', 3:'h', 4:'I', 5:'i', 6:'f', 7:'?', 10:'Q', 11:'q', 12:'d'}
PREFIX = 'stt.voxtral_realtime.'
FIELDS = ('encoder.n_layers', 'encoder.n_heads', 'encoder.head_dim',
          'decoder.n_layers', 'decoder.n_kv_heads', 'decoder.head_dim', 'decoder.sliding_window')


def read_number(source, fmt):
    if source.tell() + struct.calcsize('<' + fmt) > 128 * 1024 * 1024: raise ValueError('Metadata exceeds read limit')
    data = source.read(struct.calcsize('<' + fmt))
    if len(data) != struct.calcsize('<' + fmt): raise ValueError('Truncated GGUF metadata')
    return struct.unpack('<' + fmt, data)[0]


def read_string(source):
    length = read_number(source, 'Q')
    if length > 16 * 1024 * 1024: raise ValueError('GGUF metadata string too long')
    if source.tell() + length > 128 * 1024 * 1024: raise ValueError('Metadata exceeds read limit')
    data = source.read(length)
    if len(data) != length: raise ValueError('Truncated GGUF string')
    return data.decode('utf-8')


def read_value(source, kind, depth=0):
    if kind in FORMATS: return read_number(source, FORMATS[kind])
    if kind == 8: return read_string(source)
    if kind == 9:
        if depth >= 2: raise ValueError('Nested GGUF metadata too deep')
        item_kind = read_number(source, 'I'); count = read_number(source, 'Q')
        if count > 2_000_000: raise ValueError('GGUF array too large')
        for _ in range(count): read_value(source, item_kind, depth + 1)
        return None
    raise ValueError('Unsupported GGUF metadata type')


def inspect(path):
    values = {}
    with path.open('rb') as source:
        if source.read(4) != b'GGUF': raise ValueError('Not a GGUF file')
        version = read_number(source, 'I')
        if version not in (2, 3): raise ValueError('Unsupported GGUF version')
        read_number(source, 'Q'); metadata_count = read_number(source, 'Q')
        if metadata_count > 100_000: raise ValueError('Too many metadata entries')
        for _ in range(metadata_count):
            if source.tell() > 128 * 1024 * 1024: raise ValueError('Metadata exceeds read limit')
            key = read_string(source); kind = read_number(source, 'I'); value = read_value(source, kind)
            if key in {PREFIX + field for field in FIELDS}: values[key.removeprefix(PREFIX)] = value
        consumed = source.tell()
    if set(values) != set(FIELDS) or any(type(value) is not int or value <= 0 for value in values.values()):
        raise ValueError('Missing or invalid model dimensions')
    encoder = 2 * 1536 * values['encoder.n_heads'] * values['encoder.head_dim'] * values['encoder.n_layers'] * 4
    decoder = 2 * values['decoder.sliding_window'] * values['decoder.n_kv_heads'] * values['decoder.head_dim'] * values['decoder.n_layers'] * 2
    return {'dimensions':values, 'encoder_kv_f32_bytes':encoder, 'decoder_kv_f16_bytes':decoder,
            'total_kv_tensor_bytes':encoder + decoder, 'metadata_bytes_read':consumed,
            'weights_loaded':False, 'estimate_excludes_overhead':True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('model', type=Path)
    print(json.dumps(inspect(parser.parse_args().model), indent=2))
