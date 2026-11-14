"""Verify and list the pinned Echoless archive without extracting or executing it."""
import hashlib
import json
from pathlib import Path
import zipfile

ARCHIVE = Path('.cache/echoless-v1.2.0-windows.zip')
EXPECTED = 'df9445ddddd8d52beee1513fb45f3fca584842f61c75d0ab4c435c154736a416'


def main():
    digest = hashlib.sha256()
    with ARCHIVE.open('rb') as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != EXPECTED:
        raise ValueError('Archive SHA-256 does not match the pinned release')
    with zipfile.ZipFile(ARCHIVE) as archive:
        entries = [{'name': item.filename, 'bytes': item.file_size} for item in archive.infolist()]
    print(json.dumps({'sha256': EXPECTED, 'entries': entries, 'extracted': False, 'executed': False}, indent=2))


if __name__ == '__main__':
    main()
