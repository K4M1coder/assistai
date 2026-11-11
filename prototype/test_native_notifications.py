import unittest
from unittest.mock import patch

from prototype.native_notifications import NotificationScheduler


class NativeNotificationTests(unittest.TestCase):
    def test_waits_for_user_response_and_playback_then_sends_once(self):
        scheduler = NotificationScheduler()
        scheduler.audio_event('audio.start')
        scheduler.server_event({'type': 'task.completed', 'task_id': 't1'})
        self.assertIsNone(scheduler.next_request(playback_active=False))
        scheduler.audio_event('audio.end')
        self.assertIsNone(scheduler.next_request(playback_active=False))
        scheduler.server_event({'type': 'speech.end'})
        self.assertIsNone(scheduler.next_request(playback_active=True))
        self.assertEqual(scheduler.next_request(playback_active=False), {'type': 'notification.speak', 'task_id': 't1'})
        self.assertIsNone(scheduler.next_request(playback_active=False))
        scheduler.server_event({'type': 'notification.started', 'task_id': 't1'})
        scheduler.server_event({'type': 'speech.end'})
        self.assertIsNone(scheduler.next_request(playback_active=False))

    def test_rejection_backs_off_and_retries(self):
        scheduler = NotificationScheduler(retry_seconds=2)
        scheduler.server_event({'type': 'task.completed', 'task_id': 't1'})
        with patch('prototype.native_notifications.time.monotonic', return_value=10):
            self.assertIsNotNone(scheduler.next_request(playback_active=False))
            scheduler.server_event({'type': 'notification.rejected', 'task_id': 't1'})
            self.assertIsNone(scheduler.next_request(playback_active=False))
        with patch('prototype.native_notifications.time.monotonic', return_value=12):
            self.assertIsNotNone(scheduler.next_request(playback_active=False))

    def test_queue_is_bounded_and_duplicate_tasks_are_ignored(self):
        scheduler = NotificationScheduler(max_pending=2)
        for task in ('a', 'a', 'b', 'c'):
            scheduler.server_event({'type': 'task.completed', 'task_id': task})
        self.assertEqual(list(scheduler.pending), ['b', 'c'])

    def test_rejected_notification_stops_after_three_attempts(self):
        scheduler = NotificationScheduler(retry_seconds=0)
        scheduler.server_event({'type': 'task.completed', 'task_id': 't1'})
        for _ in range(3):
            self.assertIsNotNone(scheduler.next_request(playback_active=False))
            scheduler.server_event({'type': 'notification.rejected', 'task_id': 't1'})
        self.assertIsNone(scheduler.next_request(playback_active=False))
