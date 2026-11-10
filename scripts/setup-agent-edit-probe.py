"""Create a disposable coding fixture; this is not an OS-level sandbox."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
workspace = root / '.cache/agent-coding-probe'
workspace.mkdir(parents=True, exist_ok=True)
config = {
    '$schema': 'https://opencode.ai/config.json',
    'model': 'local/gemma',
    'provider': {'local': {'npm': '@ai-sdk/openai-compatible', 'name': 'Local llama.cpp',
        'options': {'baseURL': 'http://127.0.0.1:18080/v1', 'apiKey': 'local'},
        'models': {'gemma': {'name': 'Gemma 12B', 'tool_call': True,
                              'limit': {'context': 8192, 'output': 1024}}}}},
    'enabled_providers': ['local'],
    # OpenCode evaluates ordered matches; the catch-all must precede exceptions.
    'permission': {'*': 'deny', 'read': 'allow', 'glob': 'allow', 'grep': 'allow',
                   'edit': 'allow', 'external_directory': 'deny'},
    'lsp': False, 'snapshot': False, 'autoupdate': False,
}
(workspace / 'opencode.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
(workspace / 'calculator.py').write_text('def add(a, b):\n    return a - b\n', encoding='utf-8')
print(f'Prepared disposable fixture at {workspace}')
