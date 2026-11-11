import asyncio
import unittest
from unittest.mock import AsyncMock, Mock

from prototype.native_audio_client import _keyboard_action, run


class NativeAudioClientTests(unittest.TestCase):
    def test_rejects_nonlocal_gateway_before_audio_device_access(self):
        with self.assertRaisesRegex(ValueError, 'loopback'):
            asyncio.run(run('ws://example.com/voice'))
        with self.assertRaisesRegex(ValueError, 'loopback'):
            asyncio.run(run('https://127.0.0.1/voice'))

    def test_manual_interruption_clears_playback_and_notifies_gateway(self):
        playback, detector, socket = Mock(), Mock(), Mock()
        socket.send = AsyncMock()
        result = asyncio.run(_keyboard_action('I', playback, detector, socket))
        self.assertEqual(result, 'interrupt')
        playback.interrupt.assert_called_once()
        detector.reset.assert_called_once()
        socket.send.assert_awaited_once_with('{"type": "interrupt", "reason": "manual"}')
        self.assertEqual(asyncio.run(_keyboard_action('q', playback, detector, socket)), 'quit')


if __name__ == '__main__':
    unittest.main()
