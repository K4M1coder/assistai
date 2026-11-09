"""Download and verify a pinned official Windows SYCL build into the local cache."""
import hashlib
from pathlib import Path
import shutil
import zipfile

import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "llama-sycl-b12236"
ARCHIVE = CACHE / "llama-b12236-bin-win-sycl-x64.zip"
EXTRACTED = CACHE / "bin"
URL = "https://github.com/ggml-org/llama.cpp/releases/download/b12236/llama-b12236-bin-win-sycl-x64.zip"
SHA256 = "6ea0aad4e1b8e495a16fce447834584dc74b0f442d294e0c257b819a0ed506ab"
CACHE.mkdir(parents=True, exist_ok=True)
if not ARCHIVE.exists():
    temporary = ARCHIVE.with_suffix(".zip.part")
    with requests.get(URL, stream=True, timeout=(15, 120)) as response:
        response.raise_for_status()
        with temporary.open("wb") as output:
            shutil.copyfileobj(response.raw, output)
    temporary.replace(ARCHIVE)
digest = hashlib.file_digest(ARCHIVE.open("rb"), "sha256").hexdigest()
if digest != SHA256:
    raise ValueError(f"Archive hash mismatch: {digest}")
if not (EXTRACTED / "llama-server.exe").exists():
    EXTRACTED.mkdir(exist_ok=True)
    with zipfile.ZipFile(ARCHIVE) as source:
        root = EXTRACTED.resolve()
        for info in source.infolist():
            if not (root / info.filename).resolve().is_relative_to(root):
                raise ValueError(f"Unsafe archive member: {info.filename}")
        source.extractall(root)
print(EXTRACTED)
