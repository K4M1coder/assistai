import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTaskNotification } from './task-notification.mjs';

test('speaks a bounded, normalized excerpt of the completed result', () => {
  assert.match(formatTaskNotification('\u0000Bonjour\nle monde'), /Extrait du résultat : Bonjour le monde$/);
  assert.match(formatTaskNotification('mot '.repeat(100)), /mot…$/u);
  assert.match(formatTaskNotification('  \n '), /résultat est affiché/);
});

test('avoids sending markup, URLs and code to the speech engine', () => {
  const spoken = formatTaskNotification('## Résultat\n**Corrigé** [détails](https://example.org)\n```js\nconst x = 1;\n``` <b>OK</b> 🙂');
  assert.match(spoken, /Résultat Corrigé détails Code affiché\. OK/);
  assert.doesNotMatch(spoken, /https|```|<b>|const x|🙂|\*\*/);
});
