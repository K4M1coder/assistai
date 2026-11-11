"""Bounded notification scheduling for the experimental native client."""
from collections import deque
import time


class NotificationScheduler:
    def __init__(self, *, max_pending=20, retry_seconds=2):
        self.pending = deque(maxlen=max_pending)
        self.listening = False
        self.response_pending = False
        self.inflight = None
        self.retry_at = 0.0
        self.retry_seconds = retry_seconds
        self.attempts = 0

    def audio_event(self, kind):
        if kind == 'audio.start': self.listening = True
        elif kind == 'audio.end': self.listening = False; self.response_pending = True
        elif kind == 'audio.reset': self.listening = False
        elif kind == 'interrupt': self.listening = False; self.response_pending = False

    def server_event(self, event):
        kind = event.get('type')
        task = event.get('task_id')
        if kind == 'task.completed' and isinstance(task, str) and task and task not in self.pending and task != self.inflight:
            self.pending.append(task)
        elif kind == 'notification.started' and task == self.inflight:
            if self.pending and self.pending[0] == task: self.pending.popleft()
            self.inflight = None
            self.attempts = 0
            self.response_pending = True
        elif kind == 'notification.rejected' and task == self.inflight:
            self.inflight = None
            if self.attempts >= 3 and self.pending and self.pending[0] == task:
                self.pending.popleft()
                self.attempts = 0
            self.retry_at = time.monotonic() + self.retry_seconds
        elif kind in ('speech.end', 'speech.cancelled', 'asr.empty', 'error'):
            self.response_pending = False
            if kind == 'error': self.inflight = None; self.retry_at = time.monotonic() + self.retry_seconds

    def next_request(self, *, playback_active):
        if not self.pending or self.listening or self.response_pending or self.inflight or playback_active or time.monotonic() < self.retry_at:
            return None
        self.inflight = self.pending[0]
        self.attempts += 1
        return {'type': 'notification.speak', 'task_id': self.inflight}
