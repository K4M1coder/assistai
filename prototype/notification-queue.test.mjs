import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { NotificationQueue } from './notification-queue.mjs';

test('notifications wait for idle and a user interruption defers the current one', async () => {
  const started = [];
  let finish;
  const queue = new NotificationQueue({ speak: (item, signal) => new Promise((resolve, reject) => {
    started.push(item);
    finish = resolve;
    signal.addEventListener('abort', () => reject(new Error('interrupted')), { once: true });
  }) });
  queue.enqueue('one');
  queue.enqueue('two');
  assert.deepEqual(started, []);
  queue.setAvailable(true);
  assert.deepEqual(started, ['one']);
  queue.setAvailable(false);
  await tick();
  assert.deepEqual(started, ['one']);
  queue.setAvailable(true);
  assert.deepEqual(started, ['one', 'one']);
  finish();
  await tick();
  assert.deepEqual(started, ['one', 'one', 'two']);
  queue.close();
});

test('a failed notification reports the error and does not block the queue', async () => {
  const started = [], errors = [];
  const queue = new NotificationQueue({
    speak: async item => { started.push(item); if (item === 'bad') throw new Error('TTS unavailable'); },
    onError: (error, item) => errors.push([error.message, item]),
  });
  queue.enqueue('bad');
  queue.enqueue('good');
  queue.setAvailable(true);
  await tick();
  assert.deepEqual(started, ['bad', 'good']);
  assert.deepEqual(errors, [['TTS unavailable', 'bad']]);
  queue.close();
});
