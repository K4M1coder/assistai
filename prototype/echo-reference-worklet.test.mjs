import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('pairs variable render quanta and zero-fills a disconnected render input', () => {
  const events = [];
  let Processor;
  class Base { port = { postMessage: event => events.push(event) }; }
  const context = vm.createContext({ AudioWorkletProcessor: Base, sampleRate: 48000, Float32Array, Math, registerProcessor: (_, value) => { Processor = value; } });
  vm.runInContext(readFileSync(new URL('./client/echo-reference-worklet.js', import.meta.url), 'utf8'), context);
  const processor = new Processor();
  for (const length of [128, 256, 96, 320, 160]) {
    const mic = new Float32Array(length).fill(0.25);
    const playback = new Float32Array(length).fill(0.5);
    processor.process([[mic], [playback]], [[new Float32Array(length)]]);
  }
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.sequence), [0, 1]);
  assert.ok(events.every(event => event.capture.length === 480 && event.render.every(v => v === 0.5)));
  processor.process([[new Float32Array(480).fill(0.25)], []], [[new Float32Array(480)]]);
  assert.ok(events[2].render.every(v => v === 0));
  assert.ok(events[2].capture.every(v => v === 0.25));
});
