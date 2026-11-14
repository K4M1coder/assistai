// Isolated current-source gateway + existing loopback Vosk; no model/agent calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import WebSocket from 'ws';

const wav = await readFile('.cache/omni-french/utterance.wav');
assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
let format, audio;
for (let offset = 12; offset + 8 <= wav.length;) {
  const type = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4), start = offset + 8;
  if (start + size > wav.length) throw Error('Truncated WAV');
  if (type === 'fmt ') format = wav.subarray(start, start + size);
  if (type === 'data') audio = wav.subarray(start, start + size);
  offset = start + size + size % 2;
}
assert.ok(format?.length >= 16 && audio?.length && audio.length <= 960000 && audio.length % 2 === 0);
assert.equal(format.readUInt16LE(0), 1); assert.equal(format.readUInt16LE(2), 1);
assert.equal(format.readUInt32LE(4), 16000); assert.equal(format.readUInt16LE(14), 16);
const reserve = net.createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
const env = { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: ':memory:',
  ASSISTAI_ASR_URL: 'ws://127.0.0.1:18082/asr', ASSISTAI_LFM_REALTIME_URL: '', ASSISTAI_OPENCODE_URL: '',
  ASSISTAI_BUDGET_SAMPLE_PATH: '', ASSISTAI_RESOURCE_STATUS_PATH: '', ASSISTAI_SHARED_RESERVATIONS_PATH: '', ASSISTAI_ENABLE_SESSION_RESUME: '0' };
const child = spawn(process.execPath, ['prototype/gateway.mjs'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '', socket;
child.stderr.on('data', data => { stderr += data; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error(`Gateway startup timed out: ${stderr}`)), 8000);
    child.once('exit', code => { clearTimeout(timeout); reject(Error(`Gateway exited ${code}: ${stderr}`)); });
    child.stdout.on('data', data => { if (data.toString().includes('Experimental voice gateway')) { clearTimeout(timeout); resolve(); } });
  });
  socket = new WebSocket(`ws://127.0.0.1:${port}/voice`);
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Speech review timed out')), 30000);
    let ack = false;
    socket.on('error', error => { clearTimeout(timeout); reject(error); });
    socket.on('message', (raw, binary) => {
      if (binary) { clearTimeout(timeout); return reject(Error('Unexpected synthesized audio')); }
      const event = JSON.parse(raw);
      if (event.type === 'asr.ready') {
        socket.send(JSON.stringify({type:'speech.review.configure',enabled:true}));
        const frames = () => { for (let i = 0; i < audio.length; i += 3200) socket.send(audio.subarray(i, i + 3200)); };
        frames(); socket.send(JSON.stringify({type:'audio.reset'})); frames(); socket.send(JSON.stringify({type:'audio.end'}));
      } else if (event.type === 'asr.reset') ack = true;
      else if (event.type === 'speech.review') { clearTimeout(timeout); resolve({ack, text:event.text}); }
      else if (event.type === 'error') { clearTimeout(timeout); reject(Error(event.message)); }
    });
  });
  assert.equal(result.ack, true);
  const hash = createHash('sha256').update(result.text).digest('hex');
  assert.equal(hash, 'd2ae7a6ff579819e285c89edf536198cfadd300e88e8d8a11c70d972769ae5d4');
  console.log(JSON.stringify({resetAcknowledged:result.ack, reviewCharacters:result.text.length, transcriptSha256:hash,
    note:'Current isolated volatile gateway and existing Vosk; synthetic input only; no LLM, TTS, agent, or physical device.'}));
} finally {
  socket?.terminate();
  if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
}
