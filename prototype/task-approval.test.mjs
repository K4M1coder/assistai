import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskApproval } from './task-approval.mjs';

test('requires a single-use explicit approval and preserves the proposed task', async () => {
  const events = [], calls = [], audit = [];
  const approvals = createTaskApproval({ send: event => events.push(event), audit: (...args) => audit.push(args), execute: async (...args) => { calls.push(args); return { accepted: true }; } });
  const result = approvals.propose('Read file', 'turn', { originalRequest: 'Read file only' });
  assert.equal(result.awaiting_approval, true);
  assert.equal(calls.length, 0);
  const id = events[0].approval_id;
  assert.equal(events[0].original_request, 'Read file only');
  assert.equal(approvals.propose('Another', 'turn').accepted, false);
  await approvals.decide(id, true);
  await approvals.decide(id, true);
  assert.deepEqual(calls, [['Read file', 'turn', { originalRequest: 'Read file only', approvalId: id }]]);
  assert.deepEqual(audit, [['task.approval_requested', 'turn', id], ['task.approval_submitted', 'turn', id]]);
  assert.equal(events.at(-1).type, 'task.approval_rejected');
});

test('declined, expired, malformed and disconnected approvals never execute', async () => {
  const events = [], calls = [];
  let time = 0;
  const approvals = createTaskApproval({ send: event => events.push(event), execute: async (...args) => { calls.push(args); return { accepted: true }; }, now: () => time, timeoutMs: 100 });
  approvals.propose('Task', 'turn');
  let id = events.at(-1).approval_id;
  await approvals.decide(id, 'true');
  await approvals.decide(id, false);
  approvals.propose('Task', 'turn');
  id = events.at(-1).approval_id;
  time = 100;
  await approvals.decide(id, true);
  assert.equal(events.at(-1).type, 'task.approval_expired');
  approvals.propose('Task', 'turn');
  id = events.at(-1).approval_id;
  approvals.clear();
  await approvals.decide(id, true);
  assert.equal(calls.length, 0);
});

test('reports submission failures explicitly', async () => {
  const events = [];
  const approvals = createTaskApproval({ send: event => events.push(event), execute: async () => { throw Error('offline'); } });
  approvals.propose('Task', 'turn');
  await approvals.decide(events[0].approval_id, true);
  assert.match(events.at(-1).message, /offline/);
});

test('does not submit a task if recording its approval fails', async () => {
  const events = [], calls = [];
  const approvals = createTaskApproval({ send: event => events.push(event),
    audit: kind => { if (kind === 'task.approval_submitted') throw Error('storage unavailable'); },
    execute: async (...args) => { calls.push(args); return { accepted: true }; } });
  approvals.propose('Task', 'turn');
  await approvals.decide(events[0].approval_id, true);
  assert.equal(calls.length, 0);
  assert.equal(events.at(-1).type, 'task.approval_rejected');
});
