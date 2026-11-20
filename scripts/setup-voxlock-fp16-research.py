"""Download two pinned VoxLock FP16 graphs without overwriting existing files."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1] / '.cache/voxlock/onnx/v2'
revision = '2413b292bc2c337bfc19a9802aaf3e011e68e9c4'
models = [('enroll_fp16.onnx', 10893975, '96515a725cf0466450a41c565887a07e8c0fb0c89f6bbfbc01214433029a2f6c'),
          ('chunk_fp16.onnx', 38947947, 'c4850d3bff7cacfed360ef4708a448ced1b6bf0eb43aff06e764099c9db02e3b')]
for name, size, expected in models:
    path = root / name
    if path.exists(): raise FileExistsError(path)
    url = f'https://huggingface.co/arbazsiddiqui/voxlock/resolve/{revision}/onnx/v2/{name}'
    with urlopen(url, timeout=60) as response:
        data = response.read(size + 1)
    if len(data) != size or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Unexpected download: {name}')
    with path.open('xb') as output: output.write(data)
    print(f'{name} {size} {expected}', flush=True)
