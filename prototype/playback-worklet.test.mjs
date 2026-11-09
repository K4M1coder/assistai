import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function createProcessor() {
  let Processor;
  class MockAudioWorkletProcessor { constructor() { this.port = { onmessage: null, events: [], postMessage(event) { this.events.push(event); } }; } }
  runInNewContext(readFileSync(new URL('./client/playback-worklet.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: MockAudioWorkletProcessor, registerProcessor: (_name, type) => { Processor = type; }, sampleRate: 48000, Float32Array, Uint8Array,
  });
  return new Processor();
}

test('continuous playback handles odd packet boundaries and drains without losing samples', () => {
  const processor = createProcessor();
  const pcm = Buffer.alloc(4800 * 2);
  for (let i = 0; i < 4800; i++) pcm.writeInt16LE(16384, i * 2);
  const send = data => processor.port.onmessage({ data });
  send({ type: 'start', sampleRate: 24000 });
  for (let i = 0; i < pcm.length; i += 101) send({ type: 'audio', buffer: Uint8Array.from(pcm.subarray(i, i + 101)).buffer });
  send({ type: 'end' });
  const output = [];
  for (let i = 0; i < 90; i++) { const frame = new Float32Array(128); processor.process([], [[frame]]); output.push(...frame); }
  assert.ok(output.filter(value => value > 0.49).length >= 9598);
  assert.equal(processor.port.events.filter(event => event.type === 'drained').length, 1);
  assert.equal(processor.port.events.some(event => event.type === 'underrun'), false);
});

test('clear immediately discards queued audio', () => {
  const processor = createProcessor();
  const pcm = new Int16Array(5000).fill(12000);
  processor.port.onmessage({ data: { type: 'audio', buffer: pcm.buffer } });
  processor.port.onmessage({ data: { type: 'clear' } });
  const frame = new Float32Array(128);
  processor.process([], [[frame]]);
  assert.equal(frame.some(value => value !== 0), false);
});
