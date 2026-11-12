"""Inspect local Kyutai STT assets without loading models or contacting the network."""
import argparse
import json
from pathlib import Path
import shutil


def inspect(directory):
    root = directory.resolve(strict=True)
    config_file = root / 'config.json'
    config = json.loads(config_file.read_text(encoding='utf-8'))
    assets = {}
    for key in ('mimi_name', 'tokenizer_name'):
        value = config.get(key)
        if not isinstance(value, str) or not value or Path(value).name != value or '/' in value or '\\' in value:
            raise ValueError(f'Invalid local asset name: {key}')
        candidate = root / value
        # Do not follow symlinks outside the explicitly selected model directory.
        resolved = candidate.resolve()
        if resolved.parent != root: raise ValueError(f'Asset escapes model directory: {key}')
        assets[key] = {'name':value, 'present':resolved.is_file(), 'bytes':resolved.stat().st_size if resolved.is_file() else None}
    weights = [{'name':p.name, 'bytes':p.stat().st_size} for p in sorted(root.glob('*.gguf')) if p.is_file() and p.resolve().parent == root]
    return {'directory':str(root), 'gguf':weights, 'assets':assets, 'audio_delay_seconds':config.get('stt_config', {}).get('audio_delay_seconds'),
            'cargo_on_path':bool(shutil.which('cargo')), 'model_loaded':False, 'network_used':False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model_directory', type=Path)
    print(json.dumps(inspect(parser.parse_args().model_directory), indent=2))
