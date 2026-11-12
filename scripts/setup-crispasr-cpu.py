"""Install a pinned research-only CrispASR CPU binary in a new local cache directory."""
import hashlib
from pathlib import Path, PurePosixPath
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / '.cache' / 'crispasr-v0.8.53-windows-cpu'
ARCHIVE = ROOT / '.cache' / 'crispasr-v0.8.53-windows-cpu.zip'
URL = 'https://github.com/CrispStrobe/CrispASR/releases/download/v0.8.53/crispasr-windows-x86_64-cpu.zip'
SHA256 = '6dbb713c537248d76dde3384f0f62676ff275248774e93dbb7281f655c2e5db5'


def main():
    if TARGET.exists() or ARCHIVE.exists(): raise FileExistsError('Research destination already exists; inspect it before retrying')
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(URL, headers={'User-Agent':'assistai-research'})
    with urllib.request.urlopen(request, timeout=60) as response, ARCHIVE.open('xb') as output:
        digest = hashlib.sha256(); total = 0
        while block := response.read(1024 * 1024):
            total += len(block)
            if total > 9473398: raise ValueError('Downloaded archive exceeds expected size; partial file retained')
            digest.update(block); output.write(block)
    if total != 9473398 or digest.hexdigest() != SHA256: raise ValueError('Downloaded archive size or SHA-256 mismatch; archive retained for inspection')
    with zipfile.ZipFile(ARCHIVE) as archive:
        members = archive.infolist()
        if sum(item.file_size for item in members) > 100 * 1024 * 1024: raise ValueError('Archive is unexpectedly large')
        for item in members:
            name = PurePosixPath(item.filename)
            if name.is_absolute() or '..' in name.parts or '\\' in item.filename or ':' in item.filename:
                raise ValueError('Unsafe archive member')
            if (item.external_attr >> 16) & 0o170000 == 0o120000: raise ValueError('Archive contains a symbolic link')
        TARGET.mkdir(exist_ok=False)
        archive.extractall(TARGET)
    print(f'Verified and extracted research runtime to {TARGET}')


if __name__ == '__main__': main()
