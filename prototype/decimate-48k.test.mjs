import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimate48k } from './client/decimate-48k.js';

test('preserves passband and rejects frequencies that would alias', () => {
  const level = frequency => {
    const filter = new Decimate48k();
    const samples = Float32Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * frequency * i / 48000));
    const output = filter.process(samples).subarray(100);
    return Math.sqrt(output.reduce((sum, value) => sum + value * value, 0) / output.length);
  };
  assert.ok(level(1000) > 10000);
  assert.ok(level(12000) / level(1000) < 0.01);
});

test('keeps phase and filter history across irregular chunks', () => {
  const input = Float32Array.from({ length: 1501 }, (_, i) => Math.sin(i / 10));
  const single = new Decimate48k().process(input);
  const split = new Decimate48k();
  const joined = [...split.process(input.subarray(0, 127)), ...split.process(input.subarray(127, 907)), ...split.process(input.subarray(907))];
  assert.deepEqual(joined, [...single]);
});
