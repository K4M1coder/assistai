import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCompletedAssistant } from './agent-task-status.mjs';

test('only treats the latest completed assistant message in an idle session as a candidate result', () => {
  const finished = { info: { role: 'assistant', finish: 'stop', time: { completed: 1 } }, parts: [{ type: 'text', text: 'result' }] };
  const unfinished = { info: { role: 'assistant', time: {} } };
  const user = { info: { role: 'user', time: {} } };
  assert.equal(latestCompletedAssistant({}, 's', [finished, unfinished]), null);
  assert.equal(latestCompletedAssistant({}, 's', [finished, user]), null);
  assert.equal(latestCompletedAssistant({ s: { type: 'busy' } }, 's', [finished]), null);
  assert.equal(latestCompletedAssistant({}, 's', [finished]), finished);
  for (const finish of ['tool-calls', 'unknown', undefined]) {
    assert.equal(latestCompletedAssistant({}, 's', [{ ...finished, info: { ...finished.info, finish } }]), null);
  }
  const truncated = { ...finished, info: { ...finished.info, finish: 'length' } };
  assert.equal(latestCompletedAssistant({}, 's', [truncated]), truncated);
  assert.equal(latestCompletedAssistant({}, 's', []), null);
});
