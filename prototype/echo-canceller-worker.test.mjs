import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import makeAec from '@ennuicastr/webrtcaec3.js';

test('worker processes ordered 48 kHz frames and fails closed on a gap', async () => {
  const events = [];
  const self = { postMessage: event => events.push(event), close() {} };
  const context = vm.createContext({ self, importScripts() {}, WebRtcAec3: makeAec, Float32Array, Error, String });
  vm.runInContext(readFileSync(new URL('./client/echo-canceller-worker.js', import.meta.url), 'utf8'), context);
  await self.onmessage({ data: { type: 'init', sampleRate: 48000 } });
  assert.equal(events.at(-1).type, 'ready');
  const frame = sequence => ({ type: 'audio', sequence, sampleRate: 48000, render: new Float32Array(480), capture: new Float32Array(480) });
  await self.onmessage({ data: frame(0) });
  assert.equal(events.at(-1).type, 'audio');
  assert.equal(events.at(-1).capture.length, 480);
  await self.onmessage({ data: frame(2) });
  assert.match(events.at(-1).message, /out of sequence/);
  await self.onmessage({ data: frame(3) });
  assert.match(events.at(-1).message, /not ready/);
  await self.onmessage({ data: { type: 'close' } });
});
