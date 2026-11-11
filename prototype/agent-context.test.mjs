import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentPrompt } from './agent-context.mjs';

test('adds bounded recent events as untrusted data while keeping the task first', () => {
  const rows = [
    { kind: 'user.text', payload: JSON.stringify({ text: 'Earlier question', source: 'parallel-asr' }) },
    { kind: 'task.completed', payload: JSON.stringify({ text: 'Result BLUEBIRD' }) },
    { kind: 'other', payload: JSON.stringify({ text: 'not included' }) },
  ];
  const prompt = buildAgentPrompt('Read the file', rows);
  assert.ok(prompt.startsWith('Read the file\n\n'));
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /approximate parallel transcript/);
  assert.match(prompt, /Result BLUEBIRD/);
  assert.doesNotMatch(prompt, /not included/);
});

test('drops older entries to fit the limit and ignores malformed rows', () => {
  const rows = [
    { kind: 'user.text', payload: 'invalid' },
    { kind: 'user.text', payload: JSON.stringify({ text: 'old'.repeat(60) }) },
    { kind: 'assistant.text', payload: JSON.stringify({ text: 'new' }) },
  ];
  const prompt = buildAgentPrompt('Task', rows, 80);
  assert.doesNotMatch(prompt, /oldold/);
  assert.match(prompt, /new/);
  assert.equal(buildAgentPrompt('Task', [], 80), 'Task');
});
