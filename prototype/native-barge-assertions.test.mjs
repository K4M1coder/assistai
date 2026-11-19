import test from 'node:test';
import assert from 'node:assert/strict';
import { followupAnswer, followupTranscript, plausibleFollowupTranscript, correctFollowup } from './native-barge-assertions.mjs';

test('barge-in check requires a correct answer after the interrupt',()=>{
 const marker='Playback interrupted: microphone detected speech.';
 assert.equal(followupAnswer('Assistant: Paris.'),null);
 assert.equal(correctFollowup(followupAnswer(`Assistant: Paris.\n${marker}\nAssistant: Je ne peux pas répondre car OpenCode n'est pas configuré.`),true),false);
 assert.equal(correctFollowup('La réponse est 5.',true),true);
 assert.equal(correctFollowup('2 plus 3 font 5.',true),true);
 assert.equal(correctFollowup('2 plus 3 font 3.',true),false);
 assert.equal(correctFollowup('2 plus 3 ne font pas 5.',true),false);
 assert.equal(correctFollowup('Ce n’est pas 5.',true),false);
 assert.equal(correctFollowup('La capitale de la France est Paris.',false),true);
 assert.equal(correctFollowup('Paris est une mauvaise réponse.',false),false);
 assert.equal(followupTranscript(`You: capitale de la france\n${marker}\nYou: combien font de plus trois`),'combien font de plus trois');
 assert.equal(plausibleFollowupTranscript('combien font de plus trois',true),true);
 assert.equal(plausibleFollowupTranscript('quelle est la capitale de la france',true),false);
});
