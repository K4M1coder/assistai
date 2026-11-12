import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTask, restoreCompletedTasks } from './completed-task-cache.mjs';

const event = (kind, payload) => ({ kind, payload: JSON.stringify(payload) });

test('restores only matched completed tasks, invalidating prior results on rerun', () => {
  const rows = [
    event('task.completed', { task_id: 'orphan', text: 'ignore' }),
    { kind: 'task.started', payload: '{' },
    event('task.started', { task_id: 'one', task: ' Read   File! ' }),
    event('task.completed', { task_id: 'one', text: 'first' }),
    event('task.started', { task_id: 'two', task: 'read file' }),
    event('task.error', { task_id: 'two' }),
    event('task.started', { task_id: 'three', task: 'Other' }),
    event('task.completed', { task_id: 'three', text: 'answer' }),
  ];
  const restored = restoreCompletedTasks(rows);
  assert.equal(normalizeTask(' READ  file!? '), 'read file');
  assert.equal(restored.has('read file'), false);
  assert.deepEqual(restored.get('other'), { task_id: 'three', text: 'answer' });
});

test('bounds restored entries and keeps the latest completed result', () => {
  const rows = [];
  for (const task of ['a', 'b', 'c']) {
    rows.push(event('task.started', { task_id: task, task }));
    rows.push(event('task.completed', { task_id: task, text: task }));
  }
  assert.deepEqual([...restoreCompletedTasks(rows, 2).keys()], ['b', 'c']);
});
