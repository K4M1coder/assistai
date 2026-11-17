"""Retrieve and verify the pinned official research projector without loading it."""
import hashlib
import os
from pathlib import Path
import shutil
import requests

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.cache/lfm3-omni-research/mmproj-LFM3-Omni-2B-Q8_0.gguf'
URL = ('https://huggingface.co/LiquidAI/LFM3-Omni-2B-GGUF/resolve/'
       'd508b88f08a5b4286f2d2805a6a8d69a0ff44c72/mmproj-LFM3-Omni-2B-Q8_0.gguf')
SIZE = 506842528
SHA256 = '8a25f9d1931244429de404fccacfb7fb933970a36aa5688d2f5069f29c6b27b1'


def verified(path):
    if not path.is_file() or path.stat().st_size != SIZE: return False
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''): digest.update(chunk)
    return digest.hexdigest() == SHA256


def main():
    DEST.parent.mkdir(parents=True, exist_ok=True)
    if DEST.exists():
        if not verified(DEST): raise RuntimeError('Existing projector does not match pinned metadata')
        print(f'Verified existing projector: {DEST}'); return
    if shutil.disk_usage(DEST.parent).free < SIZE + 1024**3: raise RuntimeError('Insufficient disk space')
    temporary = DEST.with_suffix('.download')
    if temporary.exists(): raise RuntimeError('Partial download exists; inspect it before retrying')
    created = False
    try:
        with requests.get(URL, stream=True, timeout=(15, 60)) as response:
            response.raise_for_status()
            with temporary.open('xb') as output:
                created = True
                size = 0
                for chunk in response.iter_content(1024 * 1024):
                    size += len(chunk)
                    if size > SIZE: raise RuntimeError('Download exceeded expected size')
                    output.write(chunk)
        if not verified(temporary): raise RuntimeError('Downloaded projector failed verification')
        os.link(temporary, DEST)  # Atomic and refuses to overwrite a concurrent file.
        print(f'Verified projector: {DEST}; bytes={SIZE}; sha256={SHA256}')
    finally:
        if created: temporary.unlink(missing_ok=True)


if __name__ == '__main__': main()
