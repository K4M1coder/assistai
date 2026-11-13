"""Install a pinned Windows CPU/Vulkan research runtime without loading a model."""
import hashlib
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / '.cache' / 'transcribe-v0.4.2-windows-cpu-vulkan'
ARCHIVE = ROOT / '.cache' / 'transcribe-v0.4.2-windows-cpu-vulkan.tar.gz'
URL = 'https://github.com/handy-computer/transcribe.cpp/releases/download/v0.4.2/transcribe-native-0.4.2-windows-x86_64-cpu-vulkan.tar.gz'
SIZE = 18052817
SHA256 = '6094102cf57b404b050707ceb258b12ce647b92e801b5d46077214e5b030c8aa'


def main():
    if TARGET.exists() or ARCHIVE.exists(): raise FileExistsError('Research destination exists; inspect it before retrying')
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(URL, headers={'User-Agent':'assistai-research'})
    digest = hashlib.sha256(); total = 0
    with urllib.request.urlopen(request, timeout=60) as response, ARCHIVE.open('xb') as output:
        while block := response.read(1024 * 1024):
            total += len(block)
            if total > SIZE: raise ValueError('Archive exceeds expected size; partial file retained')
            digest.update(block); output.write(block)
    if total != SIZE or digest.hexdigest() != SHA256: raise ValueError('Archive size or SHA-256 mismatch; file retained')
    with tarfile.open(ARCHIVE, 'r:gz') as archive:
        members = archive.getmembers()
        if sum(item.size for item in members) > 256 * 1024 * 1024: raise ValueError('Archive expands beyond limit')
        for item in members:
            name = PurePosixPath(item.name)
            if name.is_absolute() or '..' in name.parts or '\\' in item.name or ':' in item.name:
                raise ValueError('Unsafe archive member')
            if not (item.isfile() or item.isdir()): raise ValueError('Archive contains a link or special member')
        TARGET.mkdir(exist_ok=False)
        archive.extractall(TARGET)
    print(f'Verified and extracted research runtime to {TARGET}')


if __name__ == '__main__': main()
