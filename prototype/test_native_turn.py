import unittest

import numpy as np

from prototype.native_turn import NativeTurnDetector


class NativeTurnTests(unittest.TestCase):
    def setUp(self):
        self.voice = np.full(320, 4000, dtype='<i2').tobytes()
        self.quiet = bytes(640)

    def test_preroll_and_end_are_ordered(self):
        detector = NativeTurnDetector(silence_frames=2)
        self.assertEqual(detector.feed(self.quiet), [])
        self.assertEqual(detector.feed(self.voice), [])
        self.assertEqual(detector.feed(self.voice), [])
        started = detector.feed(self.voice)
        self.assertEqual(started[0], {'type': 'audio.start'})
        self.assertEqual(started[1:], [self.quiet, self.voice, self.voice, self.voice])
        self.assertEqual(detector.feed(self.quiet), [self.quiet])
        self.assertEqual(detector.feed(self.quiet), [self.quiet, {'type': 'audio.end'}])

    def test_speaker_safe_discards_echo_and_resets_active_turn(self):
        detector = NativeTurnDetector()
        for _ in range(3): self.assertEqual(detector.feed(self.voice, playback_active=True), [])
        for _ in range(3): event = detector.feed(self.voice)
        self.assertEqual(event[0], {'type': 'audio.start'})
        self.assertEqual(detector.feed(self.voice, playback_active=True), [{'type': 'audio.reset'}])

    def test_barge_in_precedes_new_audio(self):
        detector = NativeTurnDetector()
        for _ in range(3): event = detector.feed(self.voice, playback_active=True, allow_barge_in=True)
        self.assertEqual(event[:2], [{'type':'interrupt','reason':'voice_activity'}, {'type':'audio.start'}])
        self.assertEqual(len(event[2:]), 3)

    def test_invalid_frame_rejected(self):
        with self.assertRaises(ValueError): NativeTurnDetector().feed(bytes(639))

    def test_optional_classifier_can_gate_loud_non_speech(self):
        detector = NativeTurnDetector()
        for _ in range(5): self.assertEqual(detector.feed(self.voice, speech_active=False), [])
        for _ in range(3): event = detector.feed(self.voice, speech_active=True)
        self.assertEqual(event[0], {'type':'audio.start'})


if __name__ == '__main__':
    unittest.main()
