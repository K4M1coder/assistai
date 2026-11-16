"""Prepare a disposable web-research fixture without overwriting existing files."""
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
        '$schema': 'https://opencode.ai/config.json', 'model': 'local/probe',
        'provider': {'local': {'npm': '@ai-sdk/openai-compatible', 'name': 'Local llama.cpp',
            'options': {'baseURL': 'http://127.0.0.1:18080/v1', 'apiKey': 'local'},
            'models': {'probe': {'name': 'Local probe model', 'tool_call': True,
                'limit': {'context': 8192, 'output': 1024}}}}},
        'enabled_providers': ['local'],
        'permission': {'*': 'deny', 'websearch': 'allow', 'webfetch': 'allow', 'external_directory': 'deny'},
        'lsp': False, 'snapshot': False, 'autoupdate': False,
    }
    (workspace / 'opencode.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
    (workspace / 'README.txt').write_text('Disposable web research fixture. Search queries are sent to a hosted provider.\n', encoding='utf-8')


if __name__ == '__main__':
    destination = Path(__file__).resolve().parents[1] / '.cache/agent-web-demo'
    setup(destination)
    print(f'Prepared web research fixture at {destination}')
