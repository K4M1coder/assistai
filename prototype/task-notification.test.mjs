import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTaskNotification } from './task-notification.mjs';

test('speaks a bounded, normalized excerpt of the completed result', () => {
  assert.match(formatTaskNotification('\u0000Bonjour\nle monde'), /Extrait du résultat : Bonjour le monde$/);
  assert.match(formatTaskNotification('🙂'.repeat(301)), /🙂{300}…$/u);
  assert.match(formatTaskNotification('  \n '), /résultat est affiché/);
});
