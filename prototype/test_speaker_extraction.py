import asyncio
import threading
import unittest

import numpy as np

from prototype.speaker_extraction import ExtractionFramer, ExtractionWorker


class FakeStream:
    def __init__(self, outputs):
        self.outputs = iter(outputs)

    def push(self, samples):
        return next(self.outputs)


class ExtractionFramerTests(unittest.TestCase):
    def test_reframes_variable_output_and_preserves_order(self):
        samples = np.arange(640, dtype=np.float32) / 32768
        framer = ExtractionFramer(FakeStream([samples[:100], samples[100:500], samples[500:]]))
        frame = bytes(640)
        self.assertEqual(framer.feed(frame), [])
        first = framer.feed(frame)
        second = framer.feed(frame)
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 1)
        np.testing.assert_array_equal(np.frombuffer(first[0] + second[0], dtype='<i2'), np.arange(640))

    def test_failure_is_sticky_and_never_returns_raw_audio(self):
        framer = ExtractionFramer(FakeStream([np.array([np.nan], dtype=np.float32)]))
        with self.assertRaisesRegex(ValueError, 'Invalid extractor output'):
            framer.feed(bytes(640))
        with self.assertRaisesRegex(RuntimeError, 'failed'):
            framer.feed(bytes(640))

    def test_oversized_output_is_rejected(self):
        framer = ExtractionFramer(FakeStream([np.zeros(641, dtype=np.float32)]), max_pending_samples=640)
        with self.assertRaises(OverflowError):
            framer.feed(bytes(640))
        with self.assertRaises(RuntimeError):
            framer.feed(bytes(640))

    def test_rejects_bad_input_without_advancing_stream(self):
        framer = ExtractionFramer(FakeStream([np.zeros(320, dtype=np.float32)]))
        with self.assertRaises(ValueError):
            framer.feed(bytes(10))
        self.assertEqual(len(framer.feed(bytes(640))), 1)


class ExtractionWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_runs_off_loop_and_rejects_concurrent_input(self):
        started, release = threading.Event(), threading.Event()

        class BlockingFramer:
            def feed(self, frame):
                started.set()
                if not release.wait(3):
                    raise TimeoutError('Test worker did not receive release')
                return [frame]

        worker = ExtractionWorker(BlockingFramer())
        task = asyncio.create_task(worker.feed(bytes(640)))
        try:
            self.assertTrue(await asyncio.to_thread(started.wait, 2))
            with self.assertRaises(OverflowError):
                await worker.feed(bytes(640))
            release.set()
            self.assertEqual(await task, [bytes(640)])
        finally:
            release.set()
            await worker.close()

    async def test_cancellation_discards_result_and_closes_stream(self):
        started, release = threading.Event(), threading.Event()

        class BlockingFramer:
            def feed(self, frame):
                started.set()
                if not release.wait(3):
                    raise TimeoutError('Test worker did not receive release')
                return [frame]

        worker = ExtractionWorker(BlockingFramer())
        task = asyncio.create_task(worker.feed(bytes(640)))
        try:
            self.assertTrue(await asyncio.to_thread(started.wait, 2))
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            with self.assertRaisesRegex(RuntimeError, 'closed'):
                await worker.feed(bytes(640))
        finally:
            release.set()
            await worker.close()

    async def test_worker_failure_closes_stream(self):
        worker = ExtractionWorker(ExtractionFramer(FakeStream([np.array([np.nan])])))
        try:
            with self.assertRaises(ValueError):
                await worker.feed(bytes(640))
            with self.assertRaisesRegex(RuntimeError, 'closed'):
                await worker.feed(bytes(640))
        finally:
            await worker.close()

    async def test_close_during_inference_discards_result(self):
        started, release = threading.Event(), threading.Event()

        class BlockingFramer:
            def feed(self, frame):
                started.set()
                if not release.wait(3):
                    raise TimeoutError('Test worker did not receive release')
                return [frame]

        worker = ExtractionWorker(BlockingFramer())
        task = asyncio.create_task(worker.feed(bytes(640)))
        try:
            self.assertTrue(await asyncio.to_thread(started.wait, 2))
            closing = asyncio.create_task(worker.close())
            await asyncio.sleep(0)
            release.set()
            with self.assertRaisesRegex(RuntimeError, 'closed'):
                await task
            await closing
        finally:
            release.set()
            await worker.close()


if __name__ == '__main__':
    unittest.main()
