import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('browser probe captures only scheduled notification samples', () => {
  const source = readFileSync(new URL('../scripts/probe-native-browser.mjs', import.meta.url), 'utf8');
  const setup = source.match(/await evaluate\(`(window\.__audioBytes=0;[\s\S]+?)`\);/);
  assert.ok(setup, 'Browser capture setup is present');
  class AudioContext { createBuffer(channels, length, rate) { return { channels, length, rate }; } }
  class AudioBufferSourceNode { start() { this.started = true; } }
  const log = { textContent: '' }, button = { click() {} };
  const window = {};
  const context = vm.createContext({ window, AudioContext, AudioBufferSourceNode, document: { querySelector: id => id === '#log' ? log : button }, Math });
  vm.runInContext(setup[1], context);
  const sourceNode = new AudioBufferSourceNode();
  sourceNode.buffer = { sampleRate: 24000, numberOfChannels: 1, getChannelData: () => [-1, 0, 0.5, 1] };
  sourceNode.start();
  assert.equal(window.__notificationSamples.length, 0);
  log.textContent = 'Speaking agent result.';
  sourceNode.start();
  assert.deepEqual(Array.from(window.__notificationSamples), [-32768, 0, 16384, 32767]);
  assert.equal(sourceNode.started, true);
});
