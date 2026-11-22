"""Download the pinned OpenVINO research snapshot and verify published metadata."""
import hashlib
import argparse
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download

repo = 'OpenVINO/LFM3-Omni-2B-int4-ov'
revision = '7143e4693ca68ffe39e21613aed54f9c49a65ea6'
target = Path(__file__).resolve().parents[1] / '.cache/lfm3-omni-openvino-int4'
parser = argparse.ArgumentParser(); parser.add_argument('--verify-existing', action='store_true'); args = parser.parse_args()
if target.exists() and not args.verify_existing: raise FileExistsError(f'Preserve existing snapshot: {target}')
if args.verify_existing and not target.is_dir(): raise FileNotFoundError(target)
info = HfApi().model_info(repo, revision=revision, files_metadata=True)
if info.sha != revision or not info.siblings: raise ValueError('Unexpected model metadata')
total = sum(item.size or 0 for item in info.siblings)
if total != 1975442765: raise ValueError(f'Unexpected snapshot size: {total}')
if not args.verify_existing: snapshot_download(repo_id=repo, revision=revision, local_dir=target, max_workers=4)
verified_lfs = verified_git = 0
for item in info.siblings:
    path = target / item.rfilename
    if not path.is_file() or item.size is None or path.stat().st_size != item.size:
        raise ValueError(f'Missing or incorrectly sized file: {item.rfilename}')
    if item.lfs:
        with path.open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != item.lfs.sha256:
                raise ValueError(f'Hash mismatch: {item.rfilename}')
        verified_lfs += 1
    else:
        digest = hashlib.sha1(f'blob {item.size}\0'.encode())
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''): digest.update(chunk)
        if not item.blob_id or digest.hexdigest() != item.blob_id:
            raise ValueError(f'Git blob hash mismatch: {item.rfilename}')
        verified_git += 1
print(f'revision={revision} files={len(info.siblings)} bytes={total} lfs_sha256_verified={verified_lfs} git_blobs_verified={verified_git}')
