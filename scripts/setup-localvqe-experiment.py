"""Download one pinned LocalVQE CPU experiment model and verify its digest."""
import hashlib
from pathlib import Path

from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parents[1]
REVISION = '29ca38495cba9d6393a92a4dd890f28dd81f758d'
FILE = 'localvqe-v1.4-aec-200K-f32.gguf'
SHA256 = 'b6e43138588a83bfe903ab5e143b4020b91c1e1629f5a575ac5855ff0003c731'


def main():
    path = Path(hf_hub_download(repo_id='LocalAI-io/LocalVQE', revision=REVISION,
                                filename=FILE, local_dir=ROOT / '.cache/localvqe-weights'))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SHA256:
        raise RuntimeError(f'Unexpected model SHA-256: {digest}')
    print(f'Verified {FILE}: {digest}')


if __name__ == '__main__':
    main()
