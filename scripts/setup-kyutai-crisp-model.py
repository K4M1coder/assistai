"""Download one pinned public research checkpoint and verify its SHA-256."""
import hashlib
import os
from pathlib import Path
import shutil
import tempfile

import requests

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / '.cache/kyutai-crisp-research'
NAME = 'kyutai-stt-1b-q4_k.gguf'
SIZE = 666_565_184
SHA256 = '32937b2c337e8b8b1bfd68bc90f07a1dbc9fcdfd5e7099dc770e15f0cbff512e'
URL = 'https://huggingface.co/cstr/kyutai-stt-1b-GGUF/resolve/ab83b1b3c788a8842e5ce5deebc6f6491545ead8/' + NAME


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        while block := source.read(1024 * 1024):
            value.update(block)
    return value.hexdigest()


def main():
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    target = DIRECTORY / NAME
    if target.exists():
        if target.stat().st_size != SIZE or digest(target) != SHA256:
            raise RuntimeError('Existing checkpoint does not match; refusing to overwrite')
        print(f'Verified existing checkpoint: {target}')
        return
    if shutil.disk_usage(DIRECTORY).free < SIZE + 1024 ** 3:
        raise RuntimeError('Insufficient free disk space for the checkpoint')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix='kyutai-download-', suffix='.partial', dir=DIRECTORY, delete=False) as output:
            temporary = Path(output.name)
            hasher = hashlib.sha256()
            with requests.get(URL, stream=True, timeout=(15, 60)) as response:
                response.raise_for_status()
                for block in response.iter_content(1024 * 1024):
                    if block:
                        output.write(block)
                        hasher.update(block)
                        if output.tell() > SIZE:
                            raise RuntimeError('Download exceeded expected size')
        if temporary.stat().st_size != SIZE or hasher.hexdigest() != SHA256:
            raise RuntimeError('Downloaded checkpoint failed size or SHA-256 verification')
        # A hard link on the same volume atomically refuses an existing target.
        os.link(temporary, target)
        print(f'Verified checkpoint: {target}')
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
