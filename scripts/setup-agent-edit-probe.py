"""Create a disposable coding fixture; this is not an OS-level sandbox."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1]
cache = (root / '.cache').resolve()
workspace = (root / os.environ.get('ASSISTAI_PROBE_WORKSPACE', '.cache/agent-coding-probe')).resolve()
if workspace == cache or not workspace.is_relative_to(cache):
    raise ValueError('Probe workspace must be a subdirectory of .cache')
model_url = os.environ.get('LOCAL_MODEL_URL', 'http://127.0.0.1:18080/v1')
address = urlsplit(model_url)
if address.scheme not in ('http', 'https') or address.hostname not in ('127.0.0.1', 'localhost', '::1') or address.username is not None or address.password is not None:
    raise ValueError('Model endpoint must be a local HTTP(S) URL without credentials')
# A probe must never replace a previous fixture or its configuration.
workspace.mkdir(parents=True, exist_ok=False)
config = {
    '$schema': 'https://opencode.ai/config.json',
    'model': 'local/probe',
    'provider': {'local': {'npm': '@ai-sdk/openai-compatible', 'name': 'Local llama.cpp',
        'options': {'baseURL': model_url, 'apiKey': 'local'},
        'models': {'probe': {'name': 'Local probe model', 'tool_call': True,
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
