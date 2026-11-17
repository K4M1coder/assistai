import json
import asyncio
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from prototype import kyutai_asr_server as server


class Socket:
    def __init__(self, events):
        self.events = iter(events)
        self.sent = []
        self.closed = None

    async def accept(self): pass
    async def receive(self):
        event = next(self.events)
        return {'type': 'websocket.receive', **event}
    async def send_json(self, event): self.sent.append(event)
    async def close(self, **kwargs): self.closed = kwargs


class KyutaiServerTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_client_does_not_release_worker_during_transcription(self):
        entered = asyncio.Event(); release = asyncio.Event(); calls = []
        async def background(function, pcm):
            calls.append(pcm)
            if pcm == b'first':
                entered.set(); await release.wait()
            return 'ok'
        with patch.object(server, 'worker', asyncio.Lock()), patch.object(server.asyncio, 'to_thread', side_effect=background):
            first = asyncio.create_task(server.serialized_transcribe(b'first'))
            await entered.wait(); first.cancel()
            with self.assertRaises(asyncio.CancelledError): await first
            abandoned = asyncio.create_task(server.serialized_transcribe(b'abandoned'))
            await asyncio.sleep(0.01); abandoned.cancel()
            with self.assertRaises(asyncio.CancelledError): await abandoned
            second = asyncio.create_task(server.serialized_transcribe(b'second'))
            await asyncio.sleep(0.01)
            self.assertEqual(calls, [b'first'])
            release.set()
            self.assertEqual(await asyncio.wait_for(second, 1), 'ok')
            self.assertEqual(calls, [b'first', b'second'])

    def test_budget_rejects_pressure_and_stale_samples(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'sample.json'
            sample = {'observedAt':datetime.now(timezone.utc).isoformat(), 'dedicatedBytes':10 * 1024**3,
                      'sharedBytes':100 * 1024**2, 'availableRamBytes':10 * 1024**3}
            with patch.dict(os.environ, {'ASSISTAI_KYUTAI_BUDGET_PATH':str(path)}):
                path.write_text(json.dumps(sample), encoding='utf-8'); server.check_budget()
                path.write_text(json.dumps({**sample, 'availableRamBytes':7 * 1024**3}), encoding='utf-8')
                server.check_budget()
                with self.assertRaisesRegex(RuntimeError, 'threshold'): server.check_budget(min_available=8 * 1024**3)
                path.write_text(json.dumps({**sample, 'sharedBytes':257 * 1024**2}), encoding='utf-8')
                with self.assertRaisesRegex(RuntimeError, 'threshold'): server.check_budget()
                sample['observedAt'] = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
                path.write_text(json.dumps(sample), encoding='utf-8')
                with self.assertRaisesRegex(RuntimeError, 'stale'): server.check_budget()

    async def test_reset_discards_audio_and_end_returns_transcription(self):
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / 'model'; model.touch()
            socket = Socket([{'bytes':b'\x01\x00'}, {'text':json.dumps({'type':'reset'})},
                             {'bytes':b'\x02\x00'}, {'text':json.dumps({'type':'end'})},
                             {'type':'websocket.disconnect'}])
            with patch.object(server, 'MODEL', model), patch.object(server, 'EXECUTABLE', model), \
                 patch.object(server, 'transcribe', return_value='bonjour') as transcribe:
                await server.asr(socket)
            transcribe.assert_called_once_with(b'\x02\x00')
            self.assertEqual([item['type'] for item in socket.sent], ['ready', 'reset', 'final'])
            self.assertEqual(socket.sent[-1]['text'], 'bonjour')

    async def test_rejects_invalid_audio(self):
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / 'model'; model.touch()
            socket = Socket([{'bytes':b'\x01'}])
            with patch.object(server, 'MODEL', model), patch.object(server, 'EXECUTABLE', model), \
                 patch.object(server, 'transcribe') as transcribe:
                await server.asr(socket)
            transcribe.assert_not_called()
            self.assertEqual(socket.closed['code'], 1003)

    async def test_failed_recognition_finishes_with_empty_transcript(self):
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / 'model'; model.touch()
            socket = Socket([{'bytes':b'\x02\x00'}, {'text':json.dumps({'type':'end'})},
                             {'type':'websocket.disconnect'}])
            with patch.object(server, 'MODEL', model), patch.object(server, 'EXECUTABLE', model), \
                 patch.object(server, 'transcribe', side_effect=RuntimeError('resource threshold')):
                await server.asr(socket)
            self.assertEqual([item['type'] for item in socket.sent], ['ready', 'error', 'final'])
            self.assertEqual(socket.sent[-1]['text'], '')


if __name__ == '__main__':
    unittest.main()
