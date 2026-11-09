"""Download the public Vosk French baseline into this repository's ignored cache."""
from pathlib import Path
import shutil
import zipfile

import requests

cache = Path(__file__).resolve().parents[1] / ".cache" / "vosk"
cache.mkdir(parents=True, exist_ok=True)
archive = cache / "vosk-model-small-fr-0.22.zip"
model = cache / "vosk-model-small-fr-0.22"
if not model.is_dir():
    if not archive.exists():
        url = "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip"
        temporary = archive.with_suffix(".zip.part")
        with requests.get(url, stream=True, timeout=(15, 120)) as response:
            response.raise_for_status()
            with temporary.open("wb") as output:
                shutil.copyfileobj(response.raw, output)
        temporary.replace(archive)
    with zipfile.ZipFile(archive) as source:
        root = cache.resolve()
        for info in source.infolist():
            target = (root / info.filename).resolve()
            if not target.is_relative_to(root):
                raise ValueError(f"Unsafe archive member: {info.filename}")
        source.extractall(root)
print(model)
