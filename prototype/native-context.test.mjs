import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNativeContext } from './native-context.mjs';

test('keeps bounded, labeled data and drops malformed or unknown events', () => {
  const rows = [{kind:'user.text',payload:JSON.stringify({text:'bonjour'})},{kind:'bad',payload:'{}'},{kind:'assistant.text',payload:'invalid'},{kind:'task.completed',payload:JSON.stringify({text:'x'.repeat(500)})}];
  const result = buildNativeContext(rows);
  assert.equal(result[0].source,'approximate parallel transcript');
  assert.equal(result[1].text.length,200);
  assert.ok(JSON.stringify(buildNativeContext(rows,250)).length<=250);
  assert.throws(()=>buildNativeContext(rows,1),RangeError);
});

test('retains sanitized progress for the next native session context', () => {
  const rows = [{kind:'task.progress',payload:JSON.stringify({message:'The agent is retrying.', task_id:'t1', state:'retrying'})}];
  assert.deepEqual(buildNativeContext(rows), [{kind:'task.progress',text:'The agent is retrying.'}]);
});

test('retains uncertainty and monitoring recovery without claiming completion', () => {
  const rows = ['task.uncertain', 'task.status_restored'].map(kind => ({kind, payload:JSON.stringify({message:kind === 'task.uncertain' ? 'Status unknown; task may still be running.' : 'Monitoring resumed; outcome unconfirmed.'})}));
  assert.deepEqual(buildNativeContext(rows).map(item => item.kind), ['task.uncertain', 'task.status_restored']);
  assert.match(buildNativeContext(rows)[1].text, /unconfirmed/);
});
