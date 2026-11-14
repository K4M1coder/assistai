import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { askProbeApproval } from '../scripts/interactive-probe-approval.mjs';

test('fixture approval requires a terminal and an explicit yes', async () => {
  const input = new PassThrough(), output = new PassThrough();
  assert.equal(await askProbeApproval({ approval_id: 'id', task: 'Fix calculator.py' }, input, output), false);
  input.isTTY = true;
  let printed = ''; output.on('data', chunk => { printed += chunk.toString(); });
  const result = askProbeApproval({ approval_id: 'id', original_request: 'request', task: 'Fix\u001b[31m calculator.py' }, input, output);
  input.write('y\n');
  assert.equal(await result, true);
  assert.match(printed, /Original request: request/);
  assert.doesNotMatch(printed, /\u001b/);
});
