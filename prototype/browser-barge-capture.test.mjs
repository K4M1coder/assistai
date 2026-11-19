import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('barge capture records bounded scheduled mono audio only after interruption', () => {
  const source = readFileSync(new URL('../scripts/probe-native-browser-barge-in.mjs', import.meta.url), 'utf8');
  const setup = source.match(/await evaluate\(`(window\.__before=0;[\s\S]+?)`\);/);
  assert.ok(setup, 'Browser capture setup is present');
  class AudioContext { createBuffer(channels, length, rate) { return { channels, length, rate }; } }
  class AudioBufferSourceNode { start() { this.calls = (this.calls ?? 0) + 1; } }
  const log = { textContent: '' }, button = { checked: true, click() {} }, window = {};
  const context = vm.createContext({ window, AudioContext, AudioBufferSourceNode,
    document: { querySelector: id => id === '#log' ? log : button }, Array });
  vm.runInContext(setup[1].replace('${Boolean(captureId)}', 'true').replace('${agentTts}', 'false'), context);
  const audio = new AudioBufferSourceNode();
  audio.buffer = { sampleRate: 24000, numberOfChannels: 1, getChannelData: () => new Float32Array([0.25, -0.5]) };
  audio.start();
  assert.equal(window.__afterCount, 0);
  log.textContent = 'Playback interrupted: microphone detected speech.';
  audio.start();
  assert.equal(window.__afterCount, 2);
  assert.deepEqual(Array.from(window.__afterChunks[0]), [0.25, -0.5]);
  audio.buffer = { sampleRate: 16000, numberOfChannels: 1, getChannelData: () => new Float32Array(1) };
  audio.start();
  assert.equal(window.__afterCount, 2);
  audio.buffer = { sampleRate: 24000, numberOfChannels: 1, getChannelData: () => new Float32Array(2_000_000) };
  audio.start();
  assert.equal(window.__afterOverflow, true);
  assert.equal(window.__afterChunks.length, 1);
  assert.equal(audio.calls, 4);
});

test('agent notification samples are kept separate from the interrupted follow-up', () => {
  const source = readFileSync(new URL('../scripts/probe-native-browser-barge-in.mjs', import.meta.url), 'utf8');
  const setup = source.match(/await evaluate\(`(window\.__before=0;[\s\S]+?)`\);/);
  assert.ok(setup);
  class AudioContext { createBuffer() {} }
  class AudioBufferSourceNode { start() {} }
  const log = { textContent: 'Playback interrupted: microphone detected speech.' }, button = { click() {} }, window = {};
  const context = vm.createContext({ window, AudioContext, AudioBufferSourceNode,
    document: { querySelector: id => id === '#log' ? log : button }, Array });
  vm.runInContext(setup[1].replace('${Boolean(captureId)}', 'true').replace('${agentTts}', 'true'), context);
  const audio = new AudioBufferSourceNode();
  audio.buffer = { sampleRate: 24000, numberOfChannels: 1, getChannelData: () => new Float32Array([0.25]) };
  audio.start();
  assert.equal(window.__notificationChunks.length, 0);
  log.textContent += '\nSpeaking agent result.';
  audio.buffer = { sampleRate: 24000, numberOfChannels: 1, getChannelData: () => new Float32Array([-0.5]) };
  audio.start();
  assert.equal(window.__afterChunks.length, 2);
  assert.deepEqual(Array.from(window.__notificationChunks[0]), [-0.5]);
});
