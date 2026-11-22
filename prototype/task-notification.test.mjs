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
  assert.equal(visibleAnswer('private reasoning</think'), '');
  assert.doesNotMatch(formatTaskNotification('private reasoning</analysis'), /private reasoning/);
  assert.equal(visibleAnswer('Bonjour.'), 'Bonjour.');
  assert.equal(visibleAnswer('Je lance la tâche. (En attente du résultat...)</think>J’ai lancé la recherche.'), 'J’ai lancé la recherche.');
});

test('avoids sending markup, URLs and code to the speech engine', () => {
  const spoken = formatTaskNotification('## Résultat\n**Corrigé** [détails](https://example.org)\n```js\nconst x = 1;\n``` <b>OK</b> 🙂');
  assert.match(spoken, /Résultat Corrigé détails Code affiché\. OK/);
  assert.doesNotMatch(spoken, /https|```|<b>|const x|🙂|\*\*/);
});

test('speaks simple filenames and symbols while keeping expressions on screen', () => {
  const spoken = formatTaskNotification('In `calculator.py`, did you mean the `add` function? See `a - b` and `my_helper`.');
  assert.match(spoken, /calculator point py/);
  assert.match(spoken, /\badd\b/);
  assert.match(spoken, /my tiret bas helper/);
  assert.match(spoken, /code affiché/);
  assert.doesNotMatch(spoken, /`|a - b/);
});

test('does not speak an unfinished inline code span or raw backtick', () => {
  const input = 'La fonction est `nom_partiel';
  assert.equal(visibleAnswer(input), input);
  assert.equal(speechText(input), 'La fonction est code affiché');
  assert.doesNotMatch(formatTaskNotification(input), /`|nom_partiel/);
  assert.doesNotMatch(speechText('Texte avec `` code incomplet'), /`/);
});
