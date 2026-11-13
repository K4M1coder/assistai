import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('speaker-safe and held push-to-talk can work together', async () => {
  const names = ['status', 'log', 'noise-threshold', 'noise-threshold-value', 'talk', 'stop-task', 'push-to-talk', 'speech-review', 'speaker-safe', 'interrupt', 'form', 'text', 'image', 'send', 'mode', 'start', 'stop', 'echo-status', 'partial', 'experimental-aec', 'services', 'refresh-services', 'session-memory', 'session-memory-status', 'resources'];
  const elements = Object.fromEntries(names.map(name => [name, { value: '', checked: false, textContent: '', disabled: false, setPointerCapture() {} }]));
  elements['noise-threshold'].value = '2.5';
  elements['speaker-safe'].checked = true;
  const sent = [], timers = [], playbackStarts = [];
  class Socket { static OPEN = 1; readyState = 1; send(data) { sent.push(data); } }
  class Context {
    destination = {};
    currentTime = 0;
    audioWorklet = { addModule: async () => {} };
    async resume() {};
    async close() {};
    createBiquadFilter() { return { frequency: {}, connect(node) { return node; } }; }
    createMediaStreamSource() { return { connect(node) { return node; } }; }
    createGain() { return { gain: {}, connect(node) { return node; } }; }
    createBuffer(channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return { connect() {}, start(at) { playbackStarts.push(at); }, stop() {} }; }
  }
  class Worklet { constructor() { this.port = {}; } connect(node) { return node; } disconnect() {} }
  class Reader { readAsDataURL() { this.result = 'data:image/png;base64,iVBORw0KGgo='; this.onload(); } }
  const stream = { active: true, getAudioTracks: () => [{ getSettings: () => ({ echoCancellation: true }) }], getTracks: () => [] };
  const context = vm.createContext({ document: { getElementById: id => elements[id] }, fetch: async () => ({ ok: false }), location: { host: 'localhost' }, WebSocket: Socket, AudioContext: Context, AudioWorkletNode: Worklet, FileReader: Reader, navigator: { mediaDevices: { getUserMedia: async () => stream } }, window: { addEventListener() {} }, setInterval() {}, setTimeout: (fn, delay) => timers.push({ fn, delay }), Int16Array, ArrayBuffer, Uint8Array, DataView, Set, Math, Number, JSON });
  vm.runInContext(readFileSync(new URL('./client/client.js', import.meta.url), 'utf8'), context);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'session.task_history', events:[{kind:'task.completed',text:'offline result'}]})})", context);
  assert.match(elements.log.textContent, /Previous task completed: offline result/);
  assert.ok(!sent.some(item => typeof item === 'string' && JSON.parse(item).type === 'notification.speak'));
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
  // Idle microphone frames stay local, but a bounded pre-roll reaches ASR on speech start.
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'speech.end'})}); responsePending = false", context);
  elements['push-to-talk'].checked = false; elements['push-to-talk'].onchange();
  elements['speaker-safe'].checked = false; elements['speaker-safe'].onchange();
  const onAudio = vm.runInContext('captureNode.port.onmessage', context);
  const quiet = new Int16Array(320).buffer;
  const loud = new Int16Array(320).fill(10000).buffer;
  const beforeIdle = sent.length;
  for (let i = 0; i < 20; i++) onAudio({data: quiet});
  assert.equal(sent.length, beforeIdle);
  for (let i = 0; i < 3; i++) onAudio({data: loud});
  const turnFrames = sent.slice(beforeIdle);
  assert.equal(JSON.parse(turnFrames[0]).type, 'audio.start');
  assert.equal(turnFrames.length, 11);
  assert.equal(turnFrames.filter(item => item === loud).length, 3);
  for (let i = 0; i < 35; i++) onAudio({data: quiet});
  assert.equal(sent.at(-2), quiet);
  assert.equal(JSON.parse(sent.at(-1)).type, 'audio.end');
  elements['push-to-talk'].checked = true; elements['push-to-talk'].onchange();
  elements['speaker-safe'].checked = true; elements['speaker-safe'].onchange();
  vm.runInContext("responsePending = false; ws.onmessage({data: JSON.stringify({type:'speech.start', sample_rate:24000})})", context);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'task.completed', task_id:'task-1', text:'done'})})", context);
  assert.ok(!sent.some(item => typeof item === 'string' && JSON.parse(item).type === 'notification.speak'));
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'speech.end'})})", context);
  assert.ok(sent.some(item => typeof item === 'string' && JSON.parse(item).type === 'notification.speak'));
  const requests = () => sent.filter(item => typeof item === 'string' && JSON.parse(item).type === 'notification.speak').length;
  for (let attempt = 0; attempt < 3; attempt++) {
    vm.runInContext("ws.onmessage({data: JSON.stringify({type:'notification.rejected', task_id:'task-1', reason:'busy'})})", context);
    assert.equal(timers.at(-1).delay, 500);
    timers.shift().fn();
    assert.equal(requests(), attempt + 2);
  }
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'notification.rejected', task_id:'task-1', reason:'busy'})})", context);
  assert.match(elements.log.textContent, /Could not speak/);
  assert.equal(timers.length, 0);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'speech.start', turn_id:'failed-turn', sample_rate:24000})}); ws.onmessage({data: JSON.stringify({type:'error', message:'unrelated validation error'})})", context);
  assert.equal(vm.runInContext('speechOpen', context), true);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'error', turn_id:'failed-turn', message:'TTS failed'})})", context);
  assert.equal(vm.runInContext('speechOpen', context), false);
  assert.equal(elements.status.textContent, 'TTS failed');
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'session.capabilities', mode:'cascade', text_input:true, image_input:true, spoken_image_input:true})})", context);
  elements.image.files = [{ type:'image/png', size:8 }]; elements.image.onchange();
  elements.talk.onpointerdown({ button: 0, pointerId: 1, preventDefault() {} }); elements.talk.onpointerup();
  assert.equal(JSON.parse(sent.at(-1)).image, 'data:image/png;base64,iVBORw0KGgo=');
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'speech.start', turn_id:'gap-test', sample_rate:24000})}); ws.onmessage({data: new ArrayBuffer(480)}); playbackContext.currentTime = 0.25; ws.onmessage({data: new ArrayBuffer(480)}); ws.onmessage({data: JSON.stringify({type:'speech.end', turn_id:'gap-test'})})", context);
  assert.match(elements.log.textContent, /Playback detected 1 gap/);
  vm.runInContext("playbackContext.currentTime = 1; ws.onmessage({data: JSON.stringify({type:'speech.start', turn_id:'continuous-test', sample_rate:24000})}); ws.onmessage({data: new ArrayBuffer(480)}); playbackContext.currentTime = 1.045; ws.onmessage({data: new ArrayBuffer(480)})", context);
  assert.ok(Math.abs(playbackStarts.at(-2) - 1.04) < 0.000001);
  assert.ok(Math.abs(playbackStarts.at(-1) - 1.05) < 0.000001, 'queued audio must not gain a 35 ms gap');
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'session.capabilities', mode:'cascade', text_input:true, image_input:true, task_cancel:true})}); ws.onmessage({data: JSON.stringify({type:'task.started',task_id:'agent-1',task:'example'})})", context);
  assert.equal(elements['stop-task'].disabled, false);
  elements['stop-task'].onclick();
  assert.deepEqual(JSON.parse(sent.at(-1)), {type:'task.cancel',task_id:'agent-1'});
  assert.equal(elements['stop-task'].disabled, true);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'task.started',task_id:'agent-2',task:'second'})}); ws.onmessage({data: JSON.stringify({type:'task.started',task_id:'agent-3',task:'third'})}); ws.onmessage({data: JSON.stringify({type:'task.completed',task_id:'agent-3',text:'done'})})", context);
  assert.equal(elements['stop-task'].disabled, false);
  elements['stop-task'].onclick();
  assert.deepEqual(JSON.parse(sent.at(-1)), {type:'task.cancel',task_id:'agent-2'});
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'task.cancel_rejected',task_id:'agent-2',message:'retry'})})", context);
  assert.equal(elements['stop-task'].disabled, false);
  elements['stop-task'].onclick();
  assert.equal(elements['stop-task'].disabled, true);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'task.uncertain',task_id:'agent-2',message:'status unavailable'})})", context);
  assert.equal(elements['stop-task'].disabled, false);
  vm.runInContext("ws.onmessage({data: JSON.stringify({type:'session.capabilities',mode:'cascade',text_input:true,image_input:true,speech_review:true})}); ws.onmessage({data: JSON.stringify({type:'speech.review',review_id:'review-1',text:'incorrect transcript',has_image:false})})", context);
  elements.image.files = []; elements.text.value = 'corrected transcript';
  await elements.form.onsubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(sent.at(-1)), {type:'speech.review.submit',review_id:'review-1',text:'corrected transcript'});
});

test('resumable memory is explicit and uses a browser-held capability', async () => {
  const names = ['status', 'log', 'noise-threshold', 'noise-threshold-value', 'talk', 'stop-task', 'push-to-talk', 'speech-review', 'speaker-safe', 'interrupt', 'form', 'text', 'image', 'start', 'stop', 'echo-status', 'partial', 'experimental-aec', 'services', 'refresh-services', 'session-memory', 'session-memory-status', 'resources'];
  const storage = new Map();
  let reloads = 0, selectedProtocols;
  function start() {
    const elements = Object.fromEntries(names.map(name => [name, { value: '', checked: false, textContent: '', disabled: true }]));
    elements['noise-threshold'].value = '2.5';
    class Socket { static OPEN = 1; constructor(url, protocols) { selectedProtocols = protocols; } }
    const context = vm.createContext({ document: { getElementById: id => elements[id] },
      fetch: async url => url === '/health' ? { ok: true, json: async () => ({ session_resume_enabled: true }) }
        : url === '/resources' ? { ok: true, json: async () => ({ status: 'low', dedicated_bytes: 15 * 1024 ** 3, shared_bytes: 0, available_ram_bytes: 4 * 1024 ** 3, reasons: ['RAM below reserve'], admission: 'disabled' }) }
        : { ok: false },
      location: { host: 'localhost', reload() { reloads++; } }, WebSocket: Socket,
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
      crypto: { getRandomValues: bytes => bytes.fill(1) }, window: { addEventListener() {} }, setInterval() {},
      Int16Array, ArrayBuffer, Uint8Array, DataView, Set, Math, Number, JSON, Array });
    vm.runInContext(readFileSync(new URL('./client/client.js', import.meta.url), 'utf8'), context);
    return elements;
  }
  const first = start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first['session-memory'].disabled, false);
  assert.match(first.resources.textContent, /available RAM 4\.00 GiB/);
  assert.match(first.resources.textContent, /No hard limit is enforced/);
  assert.equal(selectedProtocols, undefined);
  first['session-memory'].onclick();
  assert.equal(storage.get('assistai.session-resume.v1'), '01'.repeat(32));
  assert.equal(reloads, 1);
  const second = start();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(selectedProtocols), ['assistai-v1', `resume.${'01'.repeat(32)}`]);
  second['session-memory'].onclick();
  assert.equal(storage.size, 0);
  assert.equal(reloads, 2);
});

test('a dropped connection retries and preserves unsent text', async () => {
  const names = ['status', 'log', 'noise-threshold', 'noise-threshold-value', 'talk', 'stop-task', 'push-to-talk', 'speech-review', 'speaker-safe', 'interrupt', 'form', 'text', 'image', 'start', 'stop', 'echo-status', 'partial', 'experimental-aec', 'services', 'refresh-services', 'session-memory', 'session-memory-status', 'resources'];
  const elements = Object.fromEntries(names.map(name => [name, { value: '', checked: false, textContent: '', disabled: false }]));
  elements.text.value = 'keep this message';
  const sockets = [], timers = [];
  class Socket { static OPEN = 1; constructor() { this.readyState=1; sockets.push(this); } send() {} }
  const context = vm.createContext({ document: { getElementById: id => elements[id] }, fetch: async () => ({ ok: false }),
    location: { host: 'localhost' }, WebSocket: Socket, window: { addEventListener() {} },
    setInterval() {}, setTimeout: (fn, delay) => timers.push({ fn, delay }),
    Int16Array, ArrayBuffer, Uint8Array, DataView, Set, Math, Number, JSON });
  vm.runInContext(readFileSync(new URL('./client/client.js', import.meta.url), 'utf8'), context);
  sockets[0].readyState = 3; sockets[0].onclose({ code: 1006 });
  assert.equal(timers[0].delay, 1000);
  await elements.form.onsubmit({ preventDefault() {} });
  assert.equal(elements.text.value, 'keep this message');
  assert.match(elements.status.textContent, /not been sent/);
  timers.shift().fn();
  assert.equal(sockets.length, 2);
  sockets[1].onmessage({ data: JSON.stringify({type:'asr.ready'}) });
  assert.match(elements.status.textContent, /Ready/);
  sockets[1].readyState = 3; sockets[1].onclose({ code: 1008 });
  assert.equal(timers.length, 0);
  assert.match(elements.status.textContent, /rejected/);
});
