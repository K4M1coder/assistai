"""Download the pinned experimental CPU-only VoxLock model files."""
import hashlib
from pathlib import Path

from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parents[1]
REVISION = "1df3074af3359070ec1c08d9627f3a28d711b9b9"
FILES = {
    "enroll.onnx": "81f305c9b7a32f13d1401f53bb4c6301826a607c9e807e60912f36ef1b9fae29",
    "chunk_int8.onnx": "c50ffdc8d723fd4f91cb08889f3d0143491f95967b705f35c444a0b4afe88172",
}
for filename, expected in FILES.items():
    path = Path(hf_hub_download(repo_id="arbazsiddiqui/voxlock", revision=REVISION,
                                filename=f"onnx/v2/{filename}", local_dir=ROOT / ".cache/voxlock"))
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise RuntimeError(f"Unexpected SHA-256 for {filename}: {digest}")
    print(f"Verified {filename}: {digest}")
