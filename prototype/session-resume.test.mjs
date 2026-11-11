import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeSessionId } from './session-resume.mjs';

test('valid resume capability creates a stable non-token session identifier', () => {
  const token = 'a'.repeat(64);
  const result = resumeSessionId(`assistai-v1, resume.${token}`, true);
  assert.equal(result, resumeSessionId(`assistai-v1, resume.${token}`, true));
  assert.notEqual(result, token);
  assert.notEqual(result, resumeSessionId(`assistai-v1, resume.${'b'.repeat(64)}`, true));
  assert.equal(resumeSessionId(undefined, true), null);
});

test('rejects invalid, duplicate, unsupported and disabled capabilities', () => {
  const token = 'a'.repeat(64);
  for (const [header, enabled] of [
    [`assistai-v1, resume.${token}`, false], [`resume.${token}`, true],
    ['assistai-v1, resume.invalid', true], [`assistai-v1, resume.${token}, resume.${token}`, true],
  ]) assert.throws(() => resumeSessionId(header, enabled));
});
