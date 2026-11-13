import test from 'node:test';
import assert from 'node:assert/strict';
import { cases, inspect, run } from '../scripts/probe-controller-delegation.mjs';

test('structural checks do not claim semantic correctness', async () => {
  const wrongTask = { content: null, tool_calls: [{ function: { name: 'delegate_task', arguments: '{"task":"reverse the operation"}' } }] };
  assert.equal(inspect(wrongTask, 'delegate').structureOk, true);
  assert.equal(inspect({ tool_calls: [{ function: { name: 'delegate_task', arguments: '{' } }] }, 'delegate').structureOk, false);
  assert.equal(inspect(wrongTask, 'conversation').structureOk, false);
  const results = await run('http://127.0.0.1:1234/v1', async (_, options) => {
    const request = JSON.parse(options.body);
    const item = cases.find(entry => entry.prompt === request.messages[1].content);
    const message = item.expected === 'delegate' ? wrongTask : { content: 'Bonjour.' };
    return { ok: true, json: async () => ({ choices: [{ message }] }) };
  });
  assert.equal(results.length, cases.length);
  assert.ok(results.every(result => result.structureOk && result.semanticReview === 'required'));
  await assert.rejects(run('https://example.com/v1'), /loopback/);
});
