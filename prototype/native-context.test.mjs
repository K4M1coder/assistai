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
