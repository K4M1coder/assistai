"""Fetch two explicitly selected public MLS-Sidon samples without extracting a shard."""
import hashlib
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.cache/mls-sidon-natural'
REVISION = 'a9abb3a85d5ca67f92ed29f65003b420169e2732'
URL = f'https://huggingface.co/datasets/sarulab-speech/mls_sidon/resolve/{REVISION}/french/test-00000.tar.gz'
NAMES = {f'1406_1028_00000{i}.{suffix}' for i in (0, 1) for suffix in ('flac', 'metadata.json')}


class BoundedReader:
    def __init__(self, source, limit):
        self.source, self.remaining = source, limit

    def read(self, size):
        if size < 0 or size > self.remaining:
            raise ValueError('Compressed download limit exceeded')
        chunk = self.source.read(size)
        self.remaining -= len(chunk)
        return chunk


def main():
    if DEST.exists():
        raise FileExistsError(DEST)
    files = {}
    with urlopen(URL, timeout=30) as response, tarfile.open(fileobj=BoundedReader(response, 12 * 1024**2), mode='r|gz') as archive:
        for entry in archive:
            if entry.name in NAMES:
                if not entry.isfile() or entry.size > 2 * 1024**2 or entry.name in files:
                    raise ValueError('Invalid archive member')
                files[entry.name] = archive.extractfile(entry).read()
            if files.keys() >= NAMES:
                break
    if files.keys() != NAMES:
        raise ValueError('Selected samples not found within download limit')
    for name in NAMES:
        if name.endswith('.json'):
            metadata = json.loads(files[name])
            if metadata.get('speaker_id') != '1406' or metadata.get('id') != name.removesuffix('.metadata.json'):
                raise ValueError('Unexpected speaker metadata')
    DEST.mkdir()
    for name, data in files.items():
        with (DEST / name).open('xb') as output:
            output.write(data)
    print(json.dumps({'revision': REVISION, 'files': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in files.items()}}))


if __name__ == '__main__':
    main()
