import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('speaker-safe and held push-to-talk can work together', async () => {
  const names = ['status', 'log', 'noise-threshold', 'noise-threshold-value', 'talk', 'push-to-talk', 'speaker-safe', 'interrupt', 'form', 'text', 'start', 'stop', 'echo-status', 'partial', 'experimental-aec'];
  const elements = Object.fromEntries(names.map(name => [name, { value: '', checked: false, textContent: '', disabled: false, setPointerCapture() {} }]));
  elements['noise-threshold'].value = '2.5';
  elements['speaker-safe'].checked = true;
  const sent = [];
  class Socket { static OPEN = 1; readyState = 1; send(data) { sent.push(data); } }
  class Context {
    destination = {};
    audioWorklet = { addModule: async () => {} };
    async resume() {};
    async close() {};
    createBiquadFilter() { return { frequency: {}, connect(node) { return node; } }; }
    createMediaStreamSource() { return { connect(node) { return node; } }; }
    createGain() { return { gain: {}, connect(node) { return node; } }; }
  }
  class Worklet { constructor() { this.port = {}; } connect(node) { return node; } disconnect() {} }
  const stream = { active: true, getAudioTracks: () => [{ getSettings: () => ({ echoCancellation: true }) }], getTracks: () => [] };
  const context = vm.createContext({ document: { getElementById: id => elements[id] }, location: { host: 'localhost' }, WebSocket: Socket, AudioContext: Context, AudioWorkletNode: Worklet, navigator: { mediaDevices: { getUserMedia: async () => stream } }, window: { addEventListener() {} }, Int16Array, ArrayBuffer, Uint8Array, DataView, Set, Math, Number, JSON });
  vm.runInContext(readFileSync(new URL('./client/client.js', import.meta.url), 'utf8'), context);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'asr.ready'})})", context);
  await elements.start.onclick();
  elements['push-to-talk'].checked = true;
  elements['push-to-talk'].onchange();
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'speech.start', sample_rate:24000})})", context);
  elements.talk.onpointerdown({ button: 0, pointerId: 1, preventDefault() {} });
  assert.equal(elements.talk.textContent, 'Release to send');
  assert.ok(sent.some(item => typeof item === 'string' && JSON.parse(item).type === 'interrupt'));
  const frame = new Int16Array(320).buffer;
  vm.runInContext('captureNode.port.onmessage', context)({ data: frame });
  assert.ok(sent.includes(frame));
  elements.talk.onpointerup();
  assert.equal(elements.talk.textContent, 'Hold to talk');
  const count = sent.length;
  vm.runInContext('captureNode.port.onmessage', context)({ data: frame });
  assert.equal(sent.length, count);
  assert.equal(JSON.parse(sent.at(-1)).type, 'audio.end');
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'task.completed', task_id:'task-1', text:'done'})})", context);
  assert.ok(!sent.some(item => typeof item === 'string' && JSON.parse(item).type === 'notification.speak'));
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'speech.end'})})", context);
  assert.ok(sent.some(item => typeof item === 'string' && JSON.parse(item).type === 'notification.speak'));
});
