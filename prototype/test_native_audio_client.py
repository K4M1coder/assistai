import asyncio
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch
import wave

from prototype.native_audio_client import _keyboard_action, _load_speaker_extractor, run


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

    def test_rejects_speaker_filter_with_aec_before_opening_devices(self):
        with self.assertRaisesRegex(ValueError, 'speaker-safe'):
            asyncio.run(run('ws://127.0.0.1:18088/voice', aec=True, speaker_enrollment='unused.wav'))

    def test_speaker_stream_is_primed_before_first_capture(self):
        stream = Mock()
        model = Mock()
        model.stream.return_value = stream
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'enrollment.wav'
            with wave.open(str(path), 'wb') as wav:
                wav.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
                wav.writeframes(bytes(3 * 16000 * 2))
            with patch.dict('sys.modules', {'voxlock': SimpleNamespace(VoxLock=Mock(return_value=model))}):
                worker = _load_speaker_extractor(path)()
                self.assertEqual(stream.push.call_count, 10)
                asyncio.run(worker.close())


if __name__ == '__main__':
    unittest.main()
