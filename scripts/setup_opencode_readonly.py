"""Create the disposable read-only OpenCode fixture; never overwrite an existing one."""
import json
from pathlib import Path


def setup(workspace: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    cache = (root / '.cache').resolve()
    workspace = workspace.resolve()
    if workspace == cache or not workspace.is_relative_to(cache):
        raise ValueError('Fixture must be a subdirectory of .cache')
    workspace.mkdir(parents=True, exist_ok=False)
    config = {
        '$schema': 'https://opencode.ai/config.json',
        'model': 'local/qwen',
        'provider': {'local': {
            'npm': '@ai-sdk/openai-compatible', 'name': 'Local llama.cpp',
            'options': {'baseURL': 'http://127.0.0.1:18080/v1', 'apiKey': 'local'},
            'models': {'qwen': {'name': 'Gemma 12B', 'limit': {'context': 8192, 'output': 1024}}},
        }},
        'enabled_providers': ['local'],
        'permission': {'*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow'},
        'lsp': False, 'snapshot': False, 'autoupdate': False,
    }
    (workspace / 'opencode.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
    (workspace / 'fixture.txt').write_text("The local research fixture's secret word is BLUEBIRD.\n", encoding='utf-8')


if __name__ == '__main__':
    destination = Path(__file__).resolve().parents[1] / '.cache/opencode-probe'
    setup(destination)
    print(f'Prepared read-only fixture at {destination}')
