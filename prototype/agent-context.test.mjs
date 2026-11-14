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

test('keeps the complete original user request when a controller reverses the task', () => {
  const original = `Dans calculator.py, corrige la soustraction en addition. ${'précision '.repeat(40)}Ne change rien d’autre.`;
  const prompt = buildAgentPrompt('Change addition to subtraction in calculator.py.', [], 80, original);
  assert.ok(prompt.includes(JSON.stringify(original)));
  assert.match(prompt, /operation direction, negation and scope/);
  assert.match(prompt, /ask for clarification/);
  assert.throws(() => buildAgentPrompt('Task', [], 80, ''), /Invalid original request/);
});

test('includes uncertain task state in background context', () => {
  const prompt = buildAgentPrompt('Report status', [{kind:'task.uncertain', payload:JSON.stringify({task:'Read a file',message:'Status unknown; task may still be running.'})}]);
  assert.match(prompt, /task\.uncertain/);
  assert.match(prompt, /may still be running/);
});
