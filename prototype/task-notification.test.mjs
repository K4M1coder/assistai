import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTaskNotification } from './task-notification.mjs';
import { speechText, visibleAnswer } from './speech-text.mjs';

test('speaks a bounded, normalized excerpt of the completed result', () => {
  assert.match(formatTaskNotification('\u0000Bonjour\nle monde'), /Extrait du résultat : Bonjour le monde$/);
  assert.match(formatTaskNotification('mot '.repeat(100)), /mot…$/u);
  assert.match(formatTaskNotification('  \n '), /résultat est affiché/);
});

test('does not expose explicitly marked reasoning in visible or spoken output', () => {
  for (const text of ['<think>private reasoning</think>Bonjour.', '<analysis>private reasoning</analysis>Bonjour.',
    'private reasoning</think>Bonjour.', '<think>private reasoning</think>Bonjour.<think>unfinished private reasoning']) {
    assert.equal(visibleAnswer(text), 'Bonjour.');
    assert.equal(speechText(text), 'Bonjour.');
    assert.doesNotMatch(formatTaskNotification(text), /private reasoning/);
  }
  assert.equal(visibleAnswer('<think>private reasoning'), '');
  assert.equal(visibleAnswer('Bonjour.'), 'Bonjour.');
});

test('avoids sending markup, URLs and code to the speech engine', () => {
  const spoken = formatTaskNotification('## Résultat\n**Corrigé** [détails](https://example.org)\n```js\nconst x = 1;\n``` <b>OK</b> 🙂');
  assert.match(spoken, /Résultat Corrigé détails Code affiché\. OK/);
  assert.doesNotMatch(spoken, /https|```|<b>|const x|🙂|\*\*/);
});
