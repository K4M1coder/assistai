import test from 'node:test';
import assert from 'node:assert/strict';
import { agentProgress } from './agent-progress.mjs';

test('maps only bounded lifecycle metadata and omits provider messages', () => {
  assert.deepEqual(agentProgress({ type: 'busy', message: 'private' }), { state: 'running' });
  assert.deepEqual(agentProgress({ type: 'retry', attempt: 2, message: 'private' }), { state: 'retrying', attempt: 2 });
  assert.deepEqual(agentProgress({ type: 'retry', attempt: -1 }), { state: 'retrying' });
  assert.equal(agentProgress({ type: 'idle' }), null);
  assert.equal(agentProgress(null), null);
});
