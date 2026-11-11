import unittest

import numpy as np

from prototype.native_playback import NativePlayback


class NativePlaybackTests(unittest.TestCase):
    def test_interrupt_discards_buffer_and_stale_response(self):
        playback = NativePlayback()
        old = playback.begin()
        playback.append(old, np.full(2400, 1000, dtype='<i2').tobytes())
        self.assertTrue(playback.active())
        self.assertGreater(playback.buffered_frames(), 0)
        playback.interrupt()
        self.assertFalse(playback.active())
        self.assertEqual(playback.buffered_frames(), 0)
        new = playback.begin()
        self.assertFalse(playback.append(old, bytes(480)))
        self.assertTrue(playback.append(new, np.full(2400, 2000, dtype='<i2').tobytes()))
        playback.finish(new)
        self.assertTrue(any(playback.read_frames(1600)))
        self.assertFalse(playback.active())

    def test_overflow_fails_closed_and_old_data_cannot_reappear(self):
        playback = NativePlayback(max_buffer_seconds=0.02)
        turn = playback.begin()
        with self.assertRaises(BufferError):
            playback.append(turn, np.ones(24000, dtype='<i2').tobytes())
        self.assertEqual(playback.read_frames(320), bytes(640))
        self.assertFalse(playback.append(turn, bytes(480)))

    def test_incomplete_final_packet_clears_playback(self):
        playback = NativePlayback()
        turn = playback.begin()
        playback.append(turn, bytes(2401))
        with self.assertRaises(ValueError): playback.finish(turn)
        self.assertFalse(playback.active())
        self.assertEqual(playback.read_frames(320), bytes(640))


if __name__ == '__main__':
    unittest.main()
