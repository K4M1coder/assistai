import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import makeAec from '@ennuicastr/webrtcaec3.js';
import { Decimate48k } from './client/decimate-48k.js';

test('paired streaming frames pass through AEC and retain sample count after decimation', async () => {
  const events = [];
  const self = { postMessage: event => events.push(event), close() {} };
  const workerContext = vm.createContext({ self, importScripts() {}, WebRtcAec3: makeAec, Float32Array, Error, String });
  vm.runInContext(readFileSync(new URL('./client/echo-canceller-worker.js', import.meta.url), 'utf8'), workerContext);
  await self.onmessage({ data: { type: 'init', sampleRate: 48000 } });
  assert.equal(events.shift().type, 'ready');

  const frames = [];
  let Processor;
  class Base { port = { postMessage: event => frames.push(event) }; }
  const graphContext = vm.createContext({ AudioWorkletProcessor: Base, sampleRate: 48000, Float32Array, Math, registerProcessor: (_, value) => { Processor = value; } });
  vm.runInContext(readFileSync(new URL('./client/echo-reference-worklet.js', import.meta.url), 'utf8'), graphContext);
  const processor = new Processor(), duration = 48000 * 6, delay = 2400;
  const render = Float32Array.from({ length: duration }, (_, i) => 0.2 * Math.sin(i * 0.037) + 0.12 * Math.sin(i * 0.071));
  const decimator = new Decimate48k();
  let inputEnergy = 0, outputEnergy = 0, outputSamples = 0;
  for (let offset = 0; offset < duration; offset += 128) {
    const n = Math.min(128, duration - offset);
    const mic = Float32Array.from({ length: n }, (_, i) => offset + i >= delay ? 0.4 * render[offset + i - delay] : 0);
    processor.process([[mic], [render.subarray(offset, offset + n)]], [[new Float32Array(n)]]);
    while (frames.length) {
      const frame = frames.shift();
      await self.onmessage({ data: frame });
      const result = events.shift();
      assert.equal(result.type, 'audio');
      outputSamples += decimator.process(result.capture).length;
      if (frame.sequence >= 400) for (let i = 0; i < 480; i++) { inputEnergy += frame.capture[i] ** 2; outputEnergy += result.capture[i] ** 2; }
    }
  }
  assert.equal(outputSamples, 96000);
  assert.ok(outputEnergy < inputEnergy * 0.1, 'synthetic echo should be attenuated by at least 10 dB');
  await self.onmessage({ data: { type: 'close' } });
});
