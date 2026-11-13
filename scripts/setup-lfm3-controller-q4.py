"""Fetch and verify the pinned official Q4 controller for an offline comparison."""
import hashlib
from pathlib import Path

from huggingface_hub import hf_hub_download

REPOSITORY = 'LiquidAI/LFM3-1.7B-GGUF'
REVISION = 'cd0c74c575b5c416f3011b5b4c298077f26ca8c2'
FILENAME = 'LFM3-1.7B-Q4_K_M.gguf'
SHA256 = '3793e1e6e2266919d6e015287221b41100175a98eddaba92e111aed3b05c93c4'
SIZE = 1099627808


def main():
    path = Path(hf_hub_download(repo_id=REPOSITORY, filename=FILENAME, revision=REVISION,
                                local_dir='.cache/lfm3-controller-q4'))
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    if path.stat().st_size != SIZE or digest.hexdigest() != SHA256:
        raise ValueError('Downloaded checkpoint failed size or SHA-256 verification')
    print(f'Verified {path} ({SIZE} bytes, SHA-256 {SHA256})')


if __name__ == '__main__':
    main()
