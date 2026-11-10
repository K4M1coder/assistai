import test from 'node:test';
import assert from 'node:assert/strict';
import { createEchoBridge } from './client/echo-bridge.js';

test('limits in-flight frames and reports overload instead of building latency', () => {
  const sent = [], errors = [];
  const worker = { postMessage: message => sent.push(message), terminate() { this.terminated = true; } };
  const bridge = createEchoBridge(worker, { maxInFlight: 2, onAudio() {}, onError: message => errors.push(message) });
  assert.equal(bridge.send({}), false);
  worker.onmessage({ data: { type: 'ready' } });
  const frame = () => ({ render: new Float32Array(480), capture: new Float32Array(480) });
  assert.equal(bridge.send(frame()), true);
  assert.equal(bridge.send(frame()), true);
  assert.equal(bridge.send(frame()), false);
  assert.equal(bridge.state, 'failed');
  assert.equal(worker.terminated, true);
  assert.match(errors[0], /could not keep up/);
  assert.equal(sent.length, 3);
});
