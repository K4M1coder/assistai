import contextlib
import asyncio
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('spoken_agent_edit_probe', ROOT / 'scripts' / 'probe-spoken-agent-edit.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class FakeSocket:
    def __init__(self):
        self.events = iter([
            {'type':'asr.ready'}, {'type':'user.text','text':'synthetic request','turn_id':'task-turn'},
            {'type':'task.started','task':'Fix calculator.py','turn_id':'task-turn'},
            {'type':'assistant.text','text':'Bonjour','turn_id':'followup-turn'},
            b'\x01\x00', {'type':'task.completed'},
        ])
        self.sent = []

    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    async def recv(self):
        event = next(self.events)
        if isinstance(event, dict) and event.get('type') == 'task.completed': await asyncio.sleep(.01)
        return event if isinstance(event, bytes) else json.dumps(event)
    async def send(self, data): self.sent.append(data)


class SpokenAgentProbeTests(unittest.IsolatedAsyncioTestCase):
    async def test_records_synthetic_transcript_and_distinct_followup(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as folder:
            fixture = Path(folder) / 'calculator.py'
            fixture.write_text('def add(a, b):\n    return a - b\n', encoding='utf-8')
            socket = FakeSocket(); output = io.StringIO(); trace = io.StringIO()
            env = {'ASSISTAI_PROBE_WORKSPACE':folder, 'ASSISTAI_TEST_VOICE_URL':'ws://127.0.0.1:18091/voice'}
            with patch.dict(os.environ, env), patch.object(probe, 'connect', return_value=socket), \
                 patch.object(probe.spoken_recall, 'synthesize', return_value=b'\x00\x00'), \
                 patch.object(probe.subprocess, 'run', return_value=SimpleNamespace(returncode=0)), \
                 contextlib.redirect_stdout(output), contextlib.redirect_stderr(trace):
                await probe.main()
            result = json.loads(output.getvalue())
            self.assertEqual(result['transcript'], 'synthetic request')
            self.assertEqual(result['task_count'], 1)
            self.assertIn('synthetic_transcript', trace.getvalue())
            self.assertIn('synthetic_task', trace.getvalue())
            self.assertTrue(any(isinstance(item, bytes) for item in socket.sent))


if __name__ == '__main__': unittest.main()
