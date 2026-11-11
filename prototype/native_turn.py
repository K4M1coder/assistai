"""Deterministic microphone turn detection for the experimental native client."""
from collections import deque
import math

import numpy as np


class NativeTurnDetector:
    """Bounded energy detector; not speaker identification or echo cancellation."""

    def __init__(self, threshold=0.025, onset_frames=3, silence_frames=35, pre_roll_frames=5):
        if not math.isfinite(threshold) or not 0 < threshold < 1:
            raise ValueError('Threshold must be between zero and one')
        if min(onset_frames, silence_frames, pre_roll_frames) < 1:
            raise ValueError('Frame counts must be positive')
        self.threshold = threshold
        self.onset_frames = onset_frames
        self.silence_frames = silence_frames
        self._pre_roll = deque(maxlen=pre_roll_frames)
        self._speaking = False
        self._voiced = 0
        self._quiet = 0

    def reset(self):
        self._speaking = False
        self._voiced = 0
        self._quiet = 0
        self._pre_roll.clear()

    def feed(self, pcm, *, playback_active=False, allow_barge_in=False, speech_active=None):
        """Return ordered gateway controls and PCM for one 20 ms 16 kHz frame."""
        if not isinstance(pcm, bytes) or len(pcm) != 640:
            raise ValueError('Expected one 20 ms mono 16 kHz PCM16 frame')
        if playback_active and not allow_barge_in:
            events = [{'type': 'audio.reset'}] if self._speaking else []
            self.reset()
            return events
        samples = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
        voiced = float(np.sqrt(np.mean(samples * samples))) > self.threshold and (speech_active is None or bool(speech_active))
        if not self._speaking:
            self._pre_roll.append(pcm)
            self._voiced = self._voiced + 1 if voiced else 0
            if self._voiced < self.onset_frames:
                return []
            self._speaking = True
            self._quiet = 0
            events = [{'type': 'interrupt', 'reason': 'voice_activity'}] if playback_active else []
            events.append({'type': 'audio.start'})
            events.extend(self._pre_roll)
            self._pre_roll.clear()
            return events
        self._quiet = 0 if voiced else self._quiet + 1
        if self._quiet >= self.silence_frames:
            self.reset()
            return [pcm, {'type': 'audio.end'}]
        return [pcm]

    def finish(self):
        events = [{'type': 'audio.end'}] if self._speaking else []
        self.reset()
        return events
